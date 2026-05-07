<?php

namespace App\Console\Commands;

use App\Models\IntelligentAlert;
use App\Models\User;
use App\Models\WeatherLog;
use Illuminate\Console\Command;

class GenerateMockAlerts extends Command
{
    protected $signature = 'alerts:generate-mock {--user-id= : ID del usuario}';
    protected $description = 'Crea alertas inteligentes simuladas sin Groq API';

    public function handle(): int
    {
        $userId = $this->option('user-id') ?? 6;
        
        $user = User::find($userId);
        if (!$user) {
            $this->error("Usuario $userId no encontrado");
            return 1;
        }

        // Obtener último log del usuario
        $currentLog = WeatherLog::where('user_id', $userId)
            ->orderBy('captured_at', 'desc')
            ->first();

        if (!$currentLog) {
            $this->error("No hay logs para este usuario");
            return 1;
        }

        // Crear alerta simulada
        $alert = IntelligentAlert::create([
            'user_id' => $userId,
            'latitude' => $currentLog->latitude,
            'longitude' => $currentLog->longitude,
            'address' => $currentLog->address ?? 'Bogotá, Colombia',
            'risk_level' => 'high',
            'analysis_reason' => '⚠️ Patrón de deterioro climático detectado: Temperatura bajando progresivamente de 22°C a 10.8°C. Vientos intensificándose de 10 km/h a 52 km/h. Códigos climáticos evolucionando de parcialmente nublado a chubascos intensos (82).',
            'recommended_actions' => [
                'Buscar refugio cubierto',
                'Asegurar objetos sueltos',
                'Mantener distancia de árboles',
                'Evitar actividades al aire libre',
                'Verificar estado de vivienda',
            ],
            'user_context' => [
                'is_night' => false,
                'typical_locations' => [$currentLog->address],
                'health_risk' => 'moderate',
                'activity_level' => 'outdoor',
            ],
            'temperature' => $currentLog->temperature,
            'weather_code' => $currentLog->weather_code,
            'wind_speed' => $currentLog->wind_speed,
            'historical_pattern' => [
                'avg_temperature' => 16.4,
                'temp_trend' => 'decreasing',
                'avg_wind_speed' => 31,
                'wind_trend' => 'increasing',
                'extreme_events' => 3,
            ],
            'confidence' => 0.92,
            'is_notified' => false,
        ]);

        $this->info("✅ Alerta simulada creada:");
        $this->line("   ID: {$alert->id}");
        $this->line("   Riesgo: {$alert->risk_level}");
        $this->line("   Ubicación: {$alert->address}");
        $this->line("   Confianza: 92%");

        return 0;
    }
}
