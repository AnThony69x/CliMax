<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WeatherFetcherService
{
    private const RAW_CACHE_TTL_MINUTES = 10;

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
    public function fetchRaw(float $latitude, float $longitude, bool $forceRefresh = false): ?array
    {
        $cacheKey = $this->rawCacheKey($latitude, $longitude);
        if (! $forceRefresh && Cache::has($cacheKey)) {
            $cached = Cache::get($cacheKey);
            if (is_array($cached)) {
                return $cached;
            }
        }

        $baseUrl = config('services.weather.base_url', 'https://api.open-meteo.com/v1/forecast');
        $verify = config('services.weather.verify', false);
        $timeout = (int) config('services.weather.timeout', 8);
        $connectTimeout = (int) config('services.weather.connect_timeout', 3);

        try {
            $response = Http::withOptions(['verify' => $verify])
                ->connectTimeout($connectTimeout)
                ->timeout($timeout)
                ->get($baseUrl, [
                    'latitude' => $latitude,
                    'longitude' => $longitude,
                    'current' => implode(',', [
                        'temperature_2m',
                        'relative_humidity_2m',
                        'apparent_temperature',
                        'precipitation',
                        'rain',
                        'showers',
                        'snowfall',
                        'weather_code',
                        'cloud_cover',
                        'pressure_msl',
                        'surface_pressure',
                        'wind_speed_10m',
                        'wind_direction_10m',
                        'wind_gusts_10m',
                        'visibility',
                        'uv_index',
                        'is_day',
                    ]),
                    'hourly' => implode(',', [
                        'temperature_2m',
                        'precipitation_probability',
                        'weather_code',
                    ]),
                    'daily' => implode(',', [
                        'temperature_2m_max',
                        'temperature_2m_min',
                        'sunrise',
                        'sunset',
                        'uv_index_max',
                        'precipitation_sum',
                        'precipitation_probability_max',
                        'wind_gusts_10m_max',
                        'weather_code',
                    ]),
                    'forecast_days' => 10,
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
        if (! is_array($data)) {
            return null;
        }

        Cache::put($cacheKey, $data, now()->addMinutes(self::RAW_CACHE_TTL_MINUTES));

        return $data;
    }

    private function rawCacheKey(float $latitude, float $longitude): string
    {
        return sprintf(
            'weather:raw:v1:%s:%s',
            number_format(round($latitude, 2), 2, '.', ''),
            number_format(round($longitude, 2), 2, '.', '')
        );
    }
}
