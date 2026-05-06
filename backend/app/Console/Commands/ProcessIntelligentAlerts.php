<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Models\IntelligentAlert;
use App\Models\WeatherLog;
use App\Services\GroqAnalyzerService;
use Illuminate\Console\Command;

class ProcessIntelligentAlerts extends Command
{
    protected $signature = 'alerts:process-intelligent {--user-id= : Procesar solo para usuario específico}';
    protected $description = 'Procesa logs climáticos y genera alertas inteligentes con Groq';

    public function handle(): int
    {
        $this->info('🤖 Iniciando procesamiento de alertas inteligentes...');

        $userId = $this->option('user-id');
        $groqService = new GroqAnalyzerService();

        if ($userId) {
            return $this->processUserAlerts($userId, $groqService);
        }

        // Obtener usuarios activos (que tienen logs en últimas 48h)
        $activeUsers = WeatherLog::where('captured_at', '>=', now()->subHours(48))
            ->groupBy('user_id')
            ->pluck('user_id')
            ->filter()
            ->toArray();

        if (empty($activeUsers)) {
            $this->warn('No hay usuarios activos con logs recientes');
            return 0;
        }

        $this->info("Procesando " . count($activeUsers) . " usuarios activos...");

        $processed = 0;
        $alerts = 0;

        foreach ($activeUsers as $uid) {
            try {
                $result = $this->processUserAlerts($uid, $groqService);
                $processed++;

                if ($result > 0) {
                    $alerts += $result;
                }
            } catch (\Exception $e) {
                $this->error("Error procesando usuario $uid: " . $e->getMessage());
            }
        }

        $this->info("✅ Procesamiento completado");
        $this->info("Usuarios: $processed | Alertas generadas: $alerts");

        return 0;
    }

    /**
     * Procesa alertas para un usuario específico
     */
    private function processUserAlerts(string $userId, GroqAnalyzerService $groqService): int
    {
        // Verificar si ya analizamos este usuario en la última hora
        $lastAlert = IntelligentAlert::where('user_id', $userId)
            ->where('created_at', '>=', now()->subHours(1))
            ->first();

        if ($lastAlert) {
            $this->line("⏭️  Usuario $userId: Ya analizado hace poco");
            return 0;
        }

        // Obtener análisis de Groq
        $analysis = $groqService->analyzeAndGenerateAlert($userId);

        if (!$analysis) {
            $this->line("⊘ Usuario $userId: Sin datos para analizar");
            return 0;
        }

        // Obtener ubicación actual
        $currentLog = WeatherLog::where('user_id', $userId)
            ->orderBy('captured_at', 'desc')
            ->first();

        if (!$currentLog) {
            $this->line("⊘ Usuario $userId: Sin logs climáticos");
            return 0;
        }

        // Crear alerta inteligente
        $alert = IntelligentAlert::create([
            'user_id' => $userId,
            'latitude' => $currentLog->latitude,
            'longitude' => $currentLog->longitude,
            'address' => $currentLog->address,
            'risk_level' => $analysis['risk_level'],
            'analysis_reason' => $analysis['analysis_reason'],
            'recommended_actions' => $analysis['recommended_actions'],
            'user_context' => $analysis['user_context'],
            'temperature' => $currentLog->temperature,
            'weather_code' => $currentLog->weather_code,
            'wind_speed' => $currentLog->wind_speed,
            'historical_pattern' => $analysis['historical_pattern'],
            'is_notified' => false,
        ]);

        $emoji = match ($analysis['risk_level']) {
            'severe' => '🔴',
            'high' => '🟠',
            'medium' => '🟡',
            default => '🟢',
        };

        $this->line("$emoji Usuario $userId: Alerta generada (Riesgo: {$analysis['risk_level']})");

        return 1;
    }
}
