<?php

namespace App\Interfaces\Controllers;

use App\Http\Controllers\Controller;
use App\Http\Traits\ResolvesSupabaseUser;
use App\Models\IntelligentAlert;
use App\Models\WeatherLog;
use App\Services\GroqAnalyzerService;
use App\Services\WeatherFetcherService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class IntelligentAlertController extends Controller
{
    use ResolvesSupabaseUser;
    /**
     * Obtener alertas inteligentes del usuario
     * GET /api/intelligent-alerts
     */
    public function index(Request $request): JsonResponse
    {
        $userId = $this->resolveSupabaseUserId($request);

        if (!$userId) {
            return response()->json(['data' => [], 'message' => 'No authenticated'], 401);
        }

        $alerts = IntelligentAlert::where('user_id', $userId)
            ->recent()
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        return response()->json($alerts);
    }

    /**
     * Analizar la ubicacion actual del usuario y crear una alerta inteligente.
     * POST /api/intelligent-alerts/analyze-location
     */
    public function analyzeLocation(
        Request $request,
        WeatherFetcherService $weather,
        GroqAnalyzerService $groq
    ): JsonResponse {
        $userId = $this->resolveSupabaseUserId($request);

        if (!$userId) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $validated = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'address' => ['sometimes', 'nullable', 'string', 'max:2048'],
        ]);

        $currentWeather = $weather->fetchCurrent(
            (float) $validated['latitude'],
            (float) $validated['longitude']
        );

        if (!$currentWeather) {
            return response()->json([
                'message' => 'No se pudo consultar el clima actual para esta ubicacion.',
            ], 502);
        }

        $currentLog = WeatherLog::create([
            'user_id' => $userId,
            'latitude' => $validated['latitude'],
            'longitude' => $validated['longitude'],
            'address' => $validated['address'] ?? null,
            'temperature' => $currentWeather['temperature'],
            'weather_code' => $currentWeather['weather_code'],
            'wind_speed' => $currentWeather['wind_speed'],
            'captured_at' => now(),
            'is_guest' => false,
        ]);

        $analysis = $groq->analyzeAndGenerateAlert($userId);
        $usedGroq = $analysis !== null;

        if (!$analysis) {
            $analysis = $this->buildLocalFallbackAnalysis($currentWeather);
        }

        $alert = IntelligentAlert::create([
            'user_id' => $userId,
            'latitude' => $currentLog->latitude,
            'longitude' => $currentLog->longitude,
            'address' => $currentLog->address,
            'risk_level' => $analysis['risk_level'],
            'analysis_reason' => $analysis['analysis_reason'],
            'recommended_actions' => $analysis['recommended_actions'],
            'user_context' => array_merge($analysis['user_context'] ?? [], [
                'analysis_source' => $usedGroq ? 'groq' : 'local_fallback',
            ]),
            'temperature' => $currentLog->temperature,
            'weather_code' => $currentLog->weather_code,
            'wind_speed' => $currentLog->wind_speed,
            'historical_pattern' => $analysis['historical_pattern'],
            'is_notified' => false,
        ]);

        return response()->json([
            'data' => $alert,
            'message' => 'Alerta inteligente generada para la ubicacion actual.',
        ], 201);
    }

    /**
     * Obtener alertas no leídas
     * GET /api/intelligent-alerts/unread
     */
    public function unread(Request $request): JsonResponse
    {
        $userId = $this->resolveSupabaseUserId($request);

        if (!$userId) {
            return response()->json(['data' => [], 'message' => 'No authenticated'], 401);
        }

        $alerts = IntelligentAlert::where('user_id', $userId)
            ->unread()
            ->recent()
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['data' => $alerts]);
    }

    /**
     * Obtener alertas de alto riesgo
     * GET /api/intelligent-alerts/high-risk
     */
    public function highRisk(Request $request): JsonResponse
    {
        $userId = $this->resolveSupabaseUserId($request);

        if (!$userId) {
            return response()->json(['data' => [], 'message' => 'No authenticated'], 401);
        }

        $alerts = IntelligentAlert::where('user_id', $userId)
            ->highRisk()
            ->recent()
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['data' => $alerts]);
    }

    /**
     * Obtener detalle de una alerta
     * GET /api/intelligent-alerts/{id}
     */
    public function show(Request $request, string $id): JsonResponse
    {
        $userId = $this->resolveSupabaseUserId($request);

        if (!$userId) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $alert = IntelligentAlert::where('user_id', $userId)
            ->where('id', $id)
            ->first();

        if (!$alert) {
            return response()->json(['message' => 'Not found'], 404);
        }

        // Marcar como leída
        if (!$alert->is_read) {
            $alert->update([
                'is_read' => true,
                'read_at' => now(),
            ]);
        }

        return response()->json(['data' => $alert]);
    }

    /**
     * Proporcionar feedback del usuario sobre precisión de alerta
     * POST /api/intelligent-alerts/{id}/feedback
     */
    public function feedback(Request $request, string $id): JsonResponse
    {
        $userId = $this->resolveSupabaseUserId($request);

        if (!$userId) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $validated = $request->validate([
            'feedback' => ['required', 'in:accurate,false_positive'],
        ]);

        $alert = IntelligentAlert::where('user_id', $userId)
            ->where('id', $id)
            ->first();

        if (!$alert) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $alert->update(['user_feedback' => $validated['feedback']]);

        return response()->json([
            'data' => $alert,
            'message' => 'Feedback recorded',
        ]);
    }

    /**
     * Obtener alertas históricas por período
     * GET /api/intelligent-alerts/history?days=7
     */
    public function history(Request $request): JsonResponse
    {
        $userId = $this->resolveSupabaseUserId($request);

        if (!$userId) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $days = $request->query('days', 7);
        $days = min(max((int)$days, 1), 90); // Entre 1 y 90 días

        $alerts = IntelligentAlert::where('user_id', $userId)
            ->where('created_at', '>=', now()->subDays($days))
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['data' => $alerts]);
    }

    /**
     * Resumen de alertas (estadísticas)
     * GET /api/intelligent-alerts/summary
     */
    public function summary(Request $request): JsonResponse
    {
        $userId = $this->resolveSupabaseUserId($request);

        if (!$userId) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $recentAlerts = IntelligentAlert::where('user_id', $userId)->recent();

        $summary = [
            'total_alerts_48h' => $recentAlerts->clone()->count(),
            'unread_count' => $recentAlerts->clone()->where('is_read', false)->count(),
            'high_risk_count' => $recentAlerts->clone()->whereIn('risk_level', ['high', 'severe'])->count(),
            'by_risk_level' => [
                'low' => $recentAlerts->clone()->where('risk_level', 'low')->count(),
                'medium' => $recentAlerts->clone()->where('risk_level', 'medium')->count(),
                'high' => $recentAlerts->clone()->where('risk_level', 'high')->count(),
                'severe' => $recentAlerts->clone()->where('risk_level', 'severe')->count(),
            ],
            'accuracy_feedback' => [
                'accurate' => $recentAlerts->clone()->where('user_feedback', 'accurate')->count(),
                'false_positive' => $recentAlerts->clone()->where('user_feedback', 'false_positive')->count(),
            ],
        ];

        return response()->json(['data' => $summary]);
    }

    /**
     * Respuesta preventiva cuando Groq no esta configurado o falla.
     *
     * @param array{temperature: float|null, weather_code: int|null, wind_speed: float|null} $weather
     * @return array<string, mixed>
     */
    private function buildLocalFallbackAnalysis(array $weather): array
    {
        $code = $weather['weather_code'];
        $wind = (float) ($weather['wind_speed'] ?? 0);
        $temp = $weather['temperature'];

        $riskLevel = 'low';
        $reason = 'Condiciones estables. CliMax recomienda mantener monitoreo preventivo del clima local.';
        $actions = [
            'Mantener activas las notificaciones meteorologicas.',
            'Revisar el pronostico antes de salir.',
            'Actualizar la ubicacion si cambia de zona.',
        ];

        if (in_array($code, [95, 96, 99], true)) {
            $riskLevel = 'severe';
            $reason = 'Se detectan condiciones asociadas a tormenta. Existe riesgo para actividades al aire libre.';
            $actions = [
                'Buscar refugio en un lugar cerrado y seguro.',
                'Evitar zonas abiertas, arboles y estructuras metalicas.',
                'Mantener el telefono cargado y seguir canales oficiales.',
            ];
        } elseif (in_array($code, [65, 80, 81, 82], true)) {
            $riskLevel = 'high';
            $reason = 'Se detecta lluvia intensa o chubascos fuertes que pueden afectar la movilidad.';
            $actions = [
                'Evitar rutas inundables y desplazamientos innecesarios.',
                'Proteger documentos, equipos y objetos sensibles al agua.',
                'Usar transporte seguro y esperar a que baje la intensidad.',
            ];
        } elseif ($wind >= 40) {
            $riskLevel = 'high';
            $reason = 'La velocidad del viento es elevada y puede representar riesgo por objetos sueltos.';
            $actions = [
                'Asegurar ventanas, puertas y objetos exteriores.',
                'Evitar caminar cerca de arboles, postes o estructuras inestables.',
                'Conducir con precaucion y reducir la velocidad.',
            ];
        } elseif ($temp !== null && $temp >= 34) {
            $riskLevel = 'medium';
            $reason = 'La temperatura actual es alta y puede provocar fatiga o deshidratacion.';
            $actions = [
                'Aumentar el consumo de agua.',
                'Evitar exposicion prolongada al sol en horas criticas.',
                'Usar ropa ligera y buscar sombra con frecuencia.',
            ];
        } elseif (in_array($code, [51, 53, 55, 61, 63], true)) {
            $riskLevel = 'medium';
            $reason = 'Se detecta lluvia o llovizna. Las condiciones pueden cambiar durante el dia.';
            $actions = [
                'Llevar paraguas o impermeable.',
                'Revisar el estado de rutas antes de movilizarse.',
                'Mantener atencion a nuevas alertas de CliMax.',
            ];
        }

        return [
            'risk_level' => $riskLevel,
            'analysis_reason' => $reason,
            'recommended_actions' => $actions,
            'historical_pattern' => [
                'temp_trend' => 'stable',
                'extreme_weather_events' => in_array($riskLevel, ['high', 'severe'], true) ? 1 : 0,
                'max_wind_speed' => $wind,
            ],
            'user_context' => [
                'time_of_day' => now()->hour,
                'is_night' => now()->hour >= 22 || now()->hour <= 5,
            ],
            'used_groq' => false,
        ];
    }

}
