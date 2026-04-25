<?php

namespace App\Interfaces\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\WeatherLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

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

        $user = $this->resolveUser($request);

        $log = WeatherLog::create([
            'user_id' => $user?->id,
            'latitude' => $validated['latitude'],
            'longitude' => $validated['longitude'],
            'address' => $validated['address'] ?? null,
            'temperature' => $validated['temperature'] ?? null,
            'weather_code' => $validated['weather_code'] ?? null,
            'wind_speed' => $validated['wind_speed'] ?? null,
            'captured_at' => $validated['captured_at'] ?? null,
            'is_guest' => $user === null,
        ]);

        return response()->json([
            'data' => $log,
        ], 201);
    }

    private function resolveUser(Request $request): ?User
    {
        $token = $request->bearerToken();

        if (! $token) {
            return null;
        }

        $accessToken = PersonalAccessToken::findToken($token);
        $tokenable = $accessToken?->tokenable;

        return $tokenable instanceof User ? $tokenable : null;
    }
}
