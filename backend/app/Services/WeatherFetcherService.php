<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WeatherFetcherService
{
    /**
     * Trae el clima actual desde Open-Meteo y normaliza al esquema interno.
     * Devuelve null si la API falla.
     *
     * @return array{temperature: float|null, weather_code: int|null, wind_speed: float|null}|null
     */
    public function fetchCurrent(float $latitude, float $longitude): ?array
    {
        $raw = $this->fetchRaw($latitude, $longitude);

        if ($raw === null) {
            return null;
        }

        $current = $raw['current'] ?? [];

        return [
            'temperature' => isset($current['temperature_2m']) ? (float) $current['temperature_2m'] : null,
            'weather_code' => isset($current['weather_code']) ? (int) $current['weather_code'] : null,
            'wind_speed' => isset($current['wind_speed_10m']) ? (float) $current['wind_speed_10m'] : null,
        ];
    }

    /**
     * Devuelve el JSON crudo de Open-Meteo (manteniendo retrocompatibilidad
     * con lo que ClimaController::getClima ya retornaba al cliente).
     */
    public function fetchRaw(float $latitude, float $longitude): ?array
    {
        $baseUrl = config('services.weather.base_url', 'https://api.open-meteo.com/v1/forecast');
        $verify = config('services.weather.verify', false);

        try {
            $response = Http::withOptions(['verify' => $verify])->get($baseUrl, [
                'latitude' => $latitude,
                'longitude' => $longitude,
                'current' => 'temperature_2m,weather_code,wind_speed_10m',
                'daily' => 'temperature_2m_max,temperature_2m_min',
                'forecast_days' => 1,
                'timezone' => 'auto',
            ]);
        } catch (\Throwable $exception) {
            Log::warning('WeatherFetcherService: error de red', [
                'lat' => $latitude,
                'lon' => $longitude,
                'error' => $exception->getMessage(),
            ]);
            return null;
        }

        if (! $response->successful()) {
            Log::warning('WeatherFetcherService: respuesta no exitosa', [
                'status' => $response->status(),
                'lat' => $latitude,
                'lon' => $longitude,
            ]);
            return null;
        }

        $data = $response->json();
        return is_array($data) ? $data : null;
    }
}
