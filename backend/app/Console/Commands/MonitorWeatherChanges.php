<?php

namespace App\Console\Commands;

use App\Models\WeatherLog;
use App\Services\ExpoPushService;
use App\Services\WeatherFetcherService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

class MonitorWeatherChanges extends Command
{
    protected $signature = 'weather:monitor {--user-id= : Procesar solo para usuario especifico}';
    protected $description = 'Vigila Open-Meteo cada 15min y dispara push si detecta cambios bruscos del clima';

    private const ACTIVE_USER_WINDOW_HOURS = 6;
    private const ANTI_SPAM_TTL_HOURS = 2;
    private const TEMP_DROP_WINDOW_HOURS = 3;

    private const CALM_CODES = [0, 1, 2, 3, 51];
    private const RAIN_CODES = [61, 62, 63, 64, 65, 80, 81, 82];
    private const SNOW_CODES = [71, 72, 73, 74, 75];
    private const STORM_CODES = [95, 96, 99];

    public function handle(WeatherFetcherService $weather, ExpoPushService $expoPush): int
    {
        $this->info('Monitor de clima iniciado.');

        $userId = $this->option('user-id');

        $userIds = $userId
            ? [$userId]
            : WeatherLog::where('captured_at', '>=', now()->subHours(self::ACTIVE_USER_WINDOW_HOURS))
                ->whereNotNull('user_id')
                ->groupBy('user_id')
                ->pluck('user_id')
                ->all();

        if (empty($userIds)) {
            $this->warn('Sin usuarios activos en la ventana.');
            return 0;
        }

        $this->info('Vigilando ' . count($userIds) . ' usuario(s).');

        $changesDetected = 0;

        foreach ($userIds as $uid) {
            try {
                if ($this->processUser($uid, $weather, $expoPush)) {
                    $changesDetected++;
                }
            } catch (\Throwable $exception) {
                $this->error("Usuario $uid: " . $exception->getMessage());
            }
        }

        $this->info("Cambios detectados y notificados: $changesDetected");
        return 0;
    }

    private function processUser(string $userId, WeatherFetcherService $weather, ExpoPushService $expoPush): bool
    {
        /** @var WeatherLog|null $previous */
        $previous = WeatherLog::where('user_id', $userId)
            ->orderBy('captured_at', 'desc')
            ->first();

        if (! $previous) {
            return false;
        }

        $current = $weather->fetchCurrent((float) $previous->latitude, (float) $previous->longitude);

        if (! $current) {
            return false;
        }

        $change = $this->detectChange($previous, $current);

        if (! $change) {
            return false;
        }

        $cacheKey = "weather_monitor:{$userId}:{$change['type']}";
        if (Cache::has($cacheKey)) {
            $this->line("Usuario $userId: cambio '{$change['type']}' silenciado por anti-spam.");
            return false;
        }

        WeatherLog::create([
            'user_id' => $userId,
            'latitude' => $previous->latitude,
            'longitude' => $previous->longitude,
            'address' => $previous->address,
            'temperature' => $current['temperature'],
            'weather_code' => $current['weather_code'],
            'wind_speed' => $current['wind_speed'],
            'captured_at' => now(),
            'is_guest' => false,
        ]);

        $expoPush->sendToUsers(
            [$userId],
            $change['title'],
            $change['body'],
            [
                'changeType' => $change['type'],
                'weatherCode' => $current['weather_code'],
            ],
            'default',
            bypassQuietHours: $change['type'] === 'storm',
            logMeta: [
                'kind' => 'weather_change',
                'change_type' => $change['type'],
            ]
        );

        Cache::put($cacheKey, true, now()->addHours(self::ANTI_SPAM_TTL_HOURS));

        $this->line("Usuario $userId: push enviado por '{$change['type']}'.");
        return true;
    }

    /**
     * @return array{type: string, title: string, body: string}|null
     */
    private function detectChange(WeatherLog $previous, array $current): ?array
    {
        $previousCode = $previous->weather_code;
        $currentCode = $current['weather_code'];
        $previousWind = (float) ($previous->wind_speed ?? 0.0);
        $currentWind = (float) ($current['wind_speed'] ?? 0.0);
        $previousTemp = $previous->temperature !== null ? (float) $previous->temperature : null;
        $currentTemp = $current['temperature'];

        $wasCalm = in_array($previousCode, self::CALM_CODES, true);

        if ($wasCalm && in_array($currentCode, self::STORM_CODES, true)) {
            return [
                'type' => 'storm',
                'title' => 'Tormenta inminente',
                'body' => 'Se detectaron rayos en tu zona. Busca refugio y evita salir.',
            ];
        }

        if ($wasCalm && in_array($currentCode, self::RAIN_CODES, true)) {
            return [
                'type' => 'rain_started',
                'title' => 'Comenzo a llover',
                'body' => 'Se detecto lluvia en tu zona. Toma precauciones si vas a salir.',
            ];
        }

        if ($wasCalm && in_array($currentCode, self::SNOW_CODES, true)) {
            return [
                'type' => 'snow_started',
                'title' => 'Esta nevando',
                'body' => 'Se detecto nieve en tu zona. Maneja con precaucion y abrigate bien.',
            ];
        }

        if ($currentWind >= 40.0 && $previousWind < 20.0) {
            return [
                'type' => 'high_wind',
                'title' => 'Vientos fuertes',
                'body' => 'El viento subio a ' . round($currentWind) . ' km/h. Asegura objetos sueltos.',
            ];
        }

        if ($previousTemp !== null && $currentTemp !== null) {
            $delta = $previousTemp - $currentTemp;
            $hours = $previous->captured_at instanceof Carbon
                ? $previous->captured_at->diffInHours(now())
                : self::TEMP_DROP_WINDOW_HOURS;

            if ($delta >= 5.0 && $hours < self::TEMP_DROP_WINDOW_HOURS) {
                return [
                    'type' => 'temp_drop',
                    'title' => 'Caida de temperatura',
                    'body' => 'La temperatura bajo ' . round($delta, 1) . '°C. Abrigate bien.',
                ];
            }
        }

        return null;
    }
}
