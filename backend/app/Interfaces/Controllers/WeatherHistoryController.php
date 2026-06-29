<?php

namespace App\Interfaces\Controllers;

use App\Http\Controllers\Controller;
use App\Models\WeatherLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class WeatherHistoryController extends Controller
{
    private const RANGE_DAYS = [
        '30d' => 30,
        '90d' => 90,
        '180d' => 180,
        '365d' => 365,
    ];

    public function index(Request $request): JsonResponse
    {
        $validated = $this->validateHistoryRequest($request);

        $logs = $this->baseQuery($validated)
            ->orderBy('captured_at')
            ->limit(5000)
            ->get();

        return response()->json([
            'data' => $logs,
            'meta' => [
                'range' => $validated['range'],
                'days' => self::RANGE_DAYS[$validated['range']],
                'count' => $logs->count(),
            ],
        ]);
    }

    public function summary(Request $request): JsonResponse
    {
        $validated = $this->validateHistoryRequest($request);
        $logs = $this->baseQuery($validated)->get();

        $temperatures = $logs->pluck('temperature')->filter();
        $winds = $logs->pluck('wind_speed')->filter();
        $extremeCodes = [45, 48, 61, 62, 63, 64, 65, 71, 72, 73, 74, 75, 80, 81, 82, 95, 96, 99];
        $firstLog = $logs->sortBy('captured_at')->first();
        $lastLog = $logs->sortByDesc('captured_at')->first();

        return response()->json([
            'data' => [
                'range' => $validated['range'],
                'logs_count' => $logs->count(),
                'avg_temperature' => $temperatures->avg(),
                'min_temperature' => $temperatures->min(),
                'max_temperature' => $temperatures->max(),
                'avg_wind_speed' => $winds->avg(),
                'max_wind_speed' => $winds->max(),
                'extreme_weather_events' => $logs->whereIn('weather_code', $extremeCodes)->count(),
                'first_captured_at' => $firstLog?->captured_at?->toIso8601String(),
                'last_captured_at' => $lastLog?->captured_at?->toIso8601String(),
            ],
        ]);
    }

    public function export(Request $request): StreamedResponse
    {
        $validated = $this->validateHistoryRequest($request);
        $fileName = 'climax-weather-history-' . $validated['range'] . '.csv';

        return response()->streamDownload(function () use ($validated): void {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, [
                'captured_at',
                'latitude',
                'longitude',
                'address',
                'temperature',
                'weather_code',
                'wind_speed',
            ]);

            $this->baseQuery($validated)
                ->orderBy('captured_at')
                ->chunk(500, function ($logs) use ($handle): void {
                    foreach ($logs as $log) {
                        fputcsv($handle, [
                            optional($log->captured_at)->toIso8601String(),
                            $log->latitude,
                            $log->longitude,
                            $log->address,
                            $log->temperature,
                            $log->weather_code,
                            $log->wind_speed,
                        ]);
                    }
                });

            fclose($handle);
        }, $fileName, [
            'Content-Type' => 'text/csv',
        ]);
    }

    /** @return array{lat: float, lon: float, range: string} */
    private function validateHistoryRequest(Request $request): array
    {
        $validated = $request->validate([
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lon' => ['required', 'numeric', 'between:-180,180'],
            'range' => ['sometimes', 'string', 'in:30d,90d,180d,365d'],
        ]);

        return [
            'lat' => (float) $validated['lat'],
            'lon' => (float) $validated['lon'],
            'range' => $validated['range'] ?? '30d',
        ];
    }

    /** @param array{lat: float, lon: float, range: string} $validated */
    private function baseQuery(array $validated)
    {
        $days = self::RANGE_DAYS[$validated['range']];
        $latDelta = 0.25;
        $lonDelta = 0.25;

        return WeatherLog::query()
            ->where('captured_at', '>=', now()->subDays($days))
            ->whereBetween('latitude', [$validated['lat'] - $latDelta, $validated['lat'] + $latDelta])
            ->whereBetween('longitude', [$validated['lon'] - $lonDelta, $validated['lon'] + $lonDelta]);
    }
}
