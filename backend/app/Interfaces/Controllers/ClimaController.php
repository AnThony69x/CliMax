<?php

namespace App\Interfaces\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class ClimaController extends Controller
{
    public function getClima(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lon' => ['required', 'numeric', 'between:-180,180'],
        ]);

        $baseUrl = config('services.weather.base_url', 'https://api.open-meteo.com/v1/forecast');
        $verify = config('services.weather.verify', false);

        $response = Http::withOptions([
            'verify' => $verify,
        ])->get($baseUrl, [
            'latitude' => $validated['lat'],
            'longitude' => $validated['lon'],
            'current' => 'temperature_2m,weather_code,wind_speed_10m',
            'timezone' => 'auto',
        ]);

        if (! $response->successful()) {
            return response()->json([
                'message' => 'No se pudo obtener el clima.',
            ], 502);
        }

        return response()->json($response->json());
    }

    public function getAddress(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lon' => ['required', 'numeric', 'between:-180,180'],
        ]);

        $baseUrl = config('services.geocoding.base_url', 'https://nominatim.openstreetmap.org/reverse');
        $verify = config('services.geocoding.verify', false);

        $response = Http::withOptions([
            'verify' => $verify,
        ])->withHeaders([
            'User-Agent' => 'CliMax/1.0 (climax-backend)',
        ])->get($baseUrl, [
            'format' => 'jsonv2',
            'lat' => $validated['lat'],
            'lon' => $validated['lon'],
            'accept-language' => 'es',
        ]);

        if (! $response->successful()) {
            return response()->json([
                'message' => 'No se pudo obtener la ubicacion en texto.',
            ], 502);
        }

        return response()->json($response->json());
    }
}
