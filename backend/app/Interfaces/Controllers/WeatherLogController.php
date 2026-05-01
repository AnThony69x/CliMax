<?php

namespace App\Interfaces\Controllers;

use App\Http\Controllers\Controller;
use App\Models\WeatherLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WeatherLogController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'address' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'temperature' => ['sometimes', 'nullable', 'numeric'],
            'weather_code' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'wind_speed' => ['sometimes', 'nullable', 'numeric'],
            'captured_at' => ['sometimes', 'nullable', 'date'],
        ]);

        $userId = $this->resolveSupabaseUserId($request);

        $log = WeatherLog::create([
            'user_id' => $userId,
            'latitude' => $validated['latitude'],
            'longitude' => $validated['longitude'],
            'address' => $validated['address'] ?? null,
            'temperature' => $validated['temperature'] ?? null,
            'weather_code' => $validated['weather_code'] ?? null,
            'wind_speed' => $validated['wind_speed'] ?? null,
            'captured_at' => $validated['captured_at'] ?? null,
            'is_guest' => $userId === null,
        ]);

        return response()->json([
            'data' => $log,
        ], 201);
    }

    /**
     * Extrae el UUID del usuario de Supabase a partir del JWT bearer.
     * Decodifica el payload sin verificar la firma (solo para asociar datos,
     * la seguridad real la gestionan las rutas protegidas con supabase.auth).
     */
    private function resolveSupabaseUserId(Request $request): ?string
    {
        $token = $request->bearerToken();

        if (! $token) {
            return null;
        }

        $parts = explode('.', $token);

        if (count($parts) !== 3) {
            return null;
        }

        $payload = json_decode(
            base64_decode(str_pad(strtr($parts[1], '-_', '+/'), strlen($parts[1]) % 4, '=')),
            true
        );

        if (! is_array($payload) || ! isset($payload['sub']) || ! is_string($payload['sub'])) {
            return null;
        }

        return $payload['sub'];
    }
}
