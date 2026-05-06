<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Models\WeatherLog;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

class SeedTestWeatherData extends Command
{
    protected $signature = 'seed:weather-data {--user-id= : ID del usuario (si no se proporciona, crea uno)}';
    protected $description = 'Crea datos de clima de prueba para testear alertas inteligentes';

    public function handle(): int
    {
        $this->info('🌤️ Generando datos de clima de prueba...');

        // Obtener o crear usuario
        $userId = $this->option('user-id');
        
        if ($userId) {
            $user = User::find($userId);
            if (!$user) {
                $this->error("Usuario con ID $userId no encontrado");
                return 1;
            }
        } else {
            // Crear usuario de prueba
            $email = 'test@climax.local';
            $user = User::where('email', $email)->first();
            
            if (!$user) {
                $user = User::create([
                    'id' => Str::uuid(),
                    'email' => $email,
                    'name' => 'Test User',
                    'password' => bcrypt('test123'),
                ]);
            }
            $this->info("✅ Usuario creado/encontrado: {$user->email}");
        }

        // Crear 15 logs climáticos simulando cambio gradual (48h histórico)
        $logs = [];
        for ($i = 0; $i < 15; $i++) {
            $hoursAgo = 48 - ($i * 3.2); // Distribuir en 48 horas
            
            // Simular cambio climático: temperatura bajando, viento aumentando
            $temperature = 22 - ($i * 0.8);
            $windSpeed = 10 + ($i * 3);
            
            // Progresión de códigos: de despejado a tormenta
            if ($i < 3) {
                $weatherCode = 2; // Parcialmente nublado
            } elseif ($i < 7) {
                $weatherCode = 51; // Llovizna ligera
            } elseif ($i < 12) {
                $weatherCode = 80; // Chubascos
            } else {
                $weatherCode = 82; // Chubascos intensos
            }

            $log = WeatherLog::create([
                'user_id' => $user->id,
                'latitude' => 4.7110 + (rand(-100, 100) / 10000),
                'longitude' => -74.0721 + (rand(-100, 100) / 10000),
                'address' => 'Bogotá, Colombia',
                'temperature' => $temperature,
                'weather_code' => $weatherCode,
                'wind_speed' => $windSpeed,
                'captured_at' => now()->subHours($hoursAgo),
            ]);

            $logs[] = $log;
            $this->line("  ✓ Log $i: Temp {$temperature}°C, Viento {$windSpeed}km/h, Código {$weatherCode}");
        }

        $this->info("\n✅ Se crearon " . count($logs) . " logs de prueba");
        $this->info("📊 Ahora ejecuta: php artisan alerts:process-intelligent");
        $this->info("🔍 Para ver alertas generadas:");
        $this->info("   php artisan tinker");
        $this->info("   >>> App\\Models\\IntelligentAlert::where('user_id', '$user->id')->get()");

        return 0;
    }
}
