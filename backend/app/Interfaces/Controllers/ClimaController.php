<?php

namespace App\Interfaces\Controllers;

use App\Http\Controllers\Controller;
use App\Services\WeatherFetcherService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ClimaController extends Controller
{
    public function getClima(Request $request, WeatherFetcherService $weather): JsonResponse
    {
        $validated = $request->validate([
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lon' => ['required', 'numeric', 'between:-180,180'],
            'fresh' => ['sometimes', 'boolean'],
        ]);

        $data = $weather->fetchRaw(
            (float) $validated['lat'],
            (float) $validated['lon'],
            $request->boolean('fresh')
        );

        if ($data === null) {
            return response()->json([
                'message' => 'No se pudo obtener el clima.',
            ], 502);
        }

        return response()->json($data);
    }

    public function searchCities(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'city'     => ['required', 'string', 'min:1', 'max:100'],
            'count'    => ['sometimes', 'integer', 'min:1', 'max:20'],
            'language' => ['sometimes', 'string', 'size:2'],
        ]);

        $baseUrl  = config('services.geocoding_search.base_url', 'https://geocoding-api.open-meteo.com/v1/search');
        $verify   = config('services.geocoding_search.verify', false);
        $timeout = (int) config('services.geocoding_search.timeout', 8);
        $connectTimeout = (int) config('services.geocoding_search.connect_timeout', 3);
        $count    = $validated['count'] ?? 10;
        $language = $validated['language'] ?? 'es';

        try {
            $response = Http::withOptions([
                'verify' => $verify,
            ])
                ->connectTimeout($connectTimeout)
                ->timeout($timeout)
                ->get($baseUrl, [
                    'name'     => $validated['city'],
                    'count'    => $count,
                    'language' => $language,
                    'format'   => 'json',
                ]);
        } catch (\Throwable $exception) {
            Log::warning('ClimaController: error buscando ciudades', [
                'city' => $validated['city'],
                'error' => $exception->getMessage(),
            ]);

            return response()->json([
                'message' => 'No se pudo realizar la busqueda de ciudades.',
            ], 502);
        }

        if (! $response->successful()) {
            return response()->json([
                'message' => 'No se pudo realizar la búsqueda de ciudades.',
            ], 502);
        }

        $data    = $response->json();
        $results = collect($data['results'] ?? [])->map(fn ($item) => [
            'id'      => (string) ($item['id'] ?? uniqid()),
            'name'    => $item['name'] ?? '',
            'country' => $item['country'] ?? ($item['country_code'] ?? ''),
            'lat'     => $item['latitude'],
            'lon'     => $item['longitude'],
        ])->values();

        return response()->json(['results' => $results]);
    }

    public function getAddress(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lon' => ['required', 'numeric', 'between:-180,180'],
        ]);

        $baseUrl = config('services.geocoding.base_url', 'https://nominatim.openstreetmap.org/reverse');
        $verify = config('services.geocoding.verify', false);
        $timeout = (int) config('services.geocoding.timeout', 8);
        $connectTimeout = (int) config('services.geocoding.connect_timeout', 3);

        try {
            $response = Http::withOptions([
                'verify' => $verify,
            ])
                ->connectTimeout($connectTimeout)
                ->timeout($timeout)
                ->withHeaders([
                    'User-Agent' => 'CliMax/1.0 (climax-backend)',
                ])->get($baseUrl, [
                    'format' => 'jsonv2',
                    'lat' => $validated['lat'],
                    'lon' => $validated['lon'],
                    'accept-language' => 'es',
                ]);
        } catch (\Throwable $exception) {
            Log::warning('ClimaController: error obteniendo geocode', [
                'lat' => $validated['lat'],
                'lon' => $validated['lon'],
                'error' => $exception->getMessage(),
            ]);

            return response()->json([
                'message' => 'No se pudo obtener la ubicacion en texto.',
            ], 502);
        }

        if (! $response->successful()) {
            return response()->json([
                'message' => 'No se pudo obtener la ubicacion en texto.',
            ], 502);
        }

        return response()->json($response->json());
    }
}
