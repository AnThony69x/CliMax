<?php

namespace App\Interfaces\Controllers;

use App\Http\Controllers\Controller;
use App\Http\Traits\ResolvesSupabaseUser;
use App\Models\IntelligentAlert;
use App\Models\WeatherLog;
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

}
