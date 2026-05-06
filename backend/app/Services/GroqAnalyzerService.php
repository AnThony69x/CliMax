<?php

namespace App\Services;

use App\Models\WeatherLog;
use App\Models\Profile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Collection;

class GroqAnalyzerService
{
    private string $groqApiKey;
    private string $groqApiUrl = 'https://api.groq.com/openai/v1/chat/completions';

    public function __construct()
    {
        $this->groqApiKey = config('services.groq.api_key');
    }

    /**
     * Analiza los logs climáticos y contexto del usuario
     * para generar una alerta inteligente personalizada
     */
    public function analyzeAndGenerateAlert(?string $userId): ?array
    {
        if (!$userId) {
            return null;
        }

        try {
            // 1. Obtener histórico de clima del usuario (últimas 48 horas)
            $weatherLogs = WeatherLog::where('user_id', $userId)
                ->where('captured_at', '>=', now()->subHours(48))
                ->orderBy('captured_at', 'desc')
                ->limit(100)
                ->get();

            \Log::info("GroqAnalyzerService: User $userId - Found {$weatherLogs->count()} logs");

            if ($weatherLogs->isEmpty()) {
                \Log::info("GroqAnalyzerService: User $userId - No logs found");
                return null;
            }

            // 2. Obtener perfil y contexto del usuario
            $userProfile = null; // Profiles no tiene user_id, ignorar por ahora
            $currentLog = $weatherLogs->first();

            // 3. Construir contexto para Groq
            $context = $this->buildAnalysisContext(
                $userId,
                $weatherLogs,
                null, // Profile no tiene user_id
                $currentLog
            );

            // 4. Enviar a Groq para análisis
            $analysis = $this->callGroqApi($context);

            if (!$analysis) {
                return null;
            }

            // 5. Procesar respuesta de Groq
            return $this->processGroqResponse($analysis, $currentLog, $context);

        } catch (\Exception $e) {
            \Log::error('GroqAnalyzerService error: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Construye el contexto para enviar a Groq
     */
    private function buildAnalysisContext(
        string $userId,
        Collection $weatherLogs,
        ?Profile $profile,
        WeatherLog $currentLog
    ): array
    {
        $timeOfDay = now()->hour;
        $isNight = $timeOfDay >= 22 || $timeOfDay <= 5;

        // Análizar patrón histórico
        $temperatures = $weatherLogs->pluck('temperature')->filter()->values();
        $weatherCodes = $weatherLogs->pluck('weather_code')->filter()->values();
        $windSpeeds = $weatherLogs->pluck('wind_speed')->filter()->values();

        $pattern = [
            'avg_temperature' => $temperatures->avg(),
            'min_temperature' => $temperatures->min(),
            'max_temperature' => $temperatures->max(),
            'temp_trend' => $this->calculateTrend($temperatures),
            'extreme_weather_events' => $this->countExtremeEvents($weatherCodes),
            'avg_wind_speed' => $windSpeeds->avg(),
            'max_wind_speed' => $windSpeeds->max(),
            'wind_trend' => $this->calculateTrend($windSpeeds),
        ];

        return [
            'user_id' => $userId,
            'current_conditions' => [
                'temperature' => $currentLog->temperature,
                'weather_code' => $currentLog->weather_code,
                'weather_description' => $this->getWeatherDescription($currentLog->weather_code),
                'wind_speed' => $currentLog->wind_speed,
                'location' => $currentLog->address ?? 'Unknown',
                'coordinates' => [
                    'lat' => $currentLog->latitude,
                    'lon' => $currentLog->longitude,
                ],
            ],
            'user_context' => [
                'name' => $profile?->name ?? 'User',
                'time_of_day' => $timeOfDay,
                'is_night' => $isNight,
                'typical_locations' => $this->getTypicalLocations($weatherLogs),
            ],
            'historical_pattern' => $pattern,
            'recent_events' => [
                'logs_count' => $weatherLogs->count(),
                'time_span_hours' => 48,
                'last_updated' => $currentLog->captured_at?->toIso8601String(),
            ],
        ];
    }

    /**
     * Llama a la API de Groq para análisis de riesgo
     */
    private function callGroqApi(array $context): ?string
    {
        $prompt = $this->buildAnalysisPrompt($context);

        try {
            $response = Http::withHeaders([
                'Authorization' => 'Bearer ' . $this->groqApiKey,
                'Content-Type' => 'application/json',
            ])->post($this->groqApiUrl, [
                'model' => config('services.groq.model'),
                'messages' => [
                    [
                        'role' => 'system',
                        'content' => 'Eres un experto meteorólogo y analista de riesgos climáticos. Proporciona análisis conciso y accionable.',
                    ],
                    [
                        'role' => 'user',
                        'content' => $prompt,
                    ],
                ],
                'temperature' => 0.3,
                'max_tokens' => 1024,
            ]);

            if ($response->successful()) {
                $data = $response->json();
                return $data['choices'][0]['message']['content'] ?? null;
            }

            $errorBody = $response->body();
            \Log::warning('Groq API error: ' . $response->status());
            \Log::warning('Groq API response: ' . $errorBody);
            return null;

        } catch (\Exception $e) {
            \Log::error('Groq API call failed: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Construye el prompt para Groq
     */
    private function buildAnalysisPrompt(array $context): string
    {
        // Calcular si es de noche fuera del heredoc para evitar problema de ternario en interpolación
        $isNightText = $context['user_context']['is_night'] ? 'Sí' : 'No';
        
        return <<<PROMPT
Analiza el siguiente contexto climático y proporciona un análisis de riesgo estructurado:

**CONTEXTO ACTUAL:**
- Temperatura: {$context['current_conditions']['temperature']}°C
- Condición: {$context['current_conditions']['weather_description']}
- Viento: {$context['current_conditions']['wind_speed']} km/h
- Ubicación: {$context['current_conditions']['location']}
- Hora: {$context['user_context']['time_of_day']}:00 (Es de noche: {$isNightText})

**PATRÓN HISTÓRICO (48h):**
- Temperatura promedio: {$context['historical_pattern']['avg_temperature']}°C
- Rango: {$context['historical_pattern']['min_temperature']}°C a {$context['historical_pattern']['max_temperature']}°C
- Tendencia: {$context['historical_pattern']['temp_trend']}
- Eventos extremos: {$context['historical_pattern']['extreme_weather_events']}
- Viento promedio: {$context['historical_pattern']['avg_wind_speed']} km/h
- Viento máximo: {$context['historical_pattern']['max_wind_speed']} km/h

**ANÁLISIS REQUERIDO:**
1. Nivel de riesgo: low | medium | high | severe
2. Razón del análisis (máximo 150 palabras)
3. Acciones recomendadas (lista de 2-4 acciones específicas)
4. Confianza del análisis (0-100%)

Formato la respuesta así:
RISK_LEVEL: [nivel]
REASON: [razón]
ACTIONS: [acción1] | [acción2] | [acción3]
CONFIDENCE: [número]%
PATTERN: [descripción breve del patrón detectado]
PROMPT;
    }

    /**
     * Procesa la respuesta de Groq
     */
    private function processGroqResponse(string $response, WeatherLog $currentLog, array $context): ?array
    {
        $lines = explode("\n", $response);
        $parsed = [];

        foreach ($lines as $line) {
            if (str_starts_with($line, 'RISK_LEVEL:')) {
                $parsed['risk_level'] = trim(str_replace('RISK_LEVEL:', '', $line));
            } elseif (str_starts_with($line, 'REASON:')) {
                $parsed['reason'] = trim(str_replace('REASON:', '', $line));
            } elseif (str_starts_with($line, 'ACTIONS:')) {
                $actions = trim(str_replace('ACTIONS:', '', $line));
                $parsed['actions'] = array_map('trim', explode('|', $actions));
            } elseif (str_starts_with($line, 'CONFIDENCE:')) {
                $parsed['confidence'] = (int) trim(str_replace('CONFIDENCE:', '', str_replace('%', '', $line)));
            } elseif (str_starts_with($line, 'PATTERN:')) {
                $parsed['pattern'] = trim(str_replace('PATTERN:', '', $line));
            }
        }

        // Validar riesgo
        $riskLevel = $this->normalizeRiskLevel($parsed['risk_level'] ?? 'low');

        return [
            'risk_level' => $riskLevel,
            'analysis_reason' => $parsed['reason'] ?? 'Análisis realizado por IA',
            'recommended_actions' => $parsed['actions'] ?? [],
            'historical_pattern' => $context['historical_pattern'],
            'user_context' => $context['user_context'],
            'confidence' => $parsed['confidence'] ?? 50,
        ];
    }

    /**
     * Normaliza el nivel de riesgo
     */
    private function normalizeRiskLevel(string $level): string
    {
        $normalized = strtolower(trim($level));
        $valid = ['low', 'medium', 'high', 'severe'];
        return in_array($normalized, $valid) ? $normalized : 'low';
    }

    /**
     * Cuenta eventos climáticos extremos
     */
    private function countExtremeEvents(Collection $weatherCodes): int
    {
        // Códigos extremos: 45-48 (niebla), 61-65 (lluvia), 71-75 (nieve), 80-82 (chubascos), 95-99 (tormentas)
        $extremeCodes = [45, 48, 61, 62, 63, 64, 65, 71, 72, 73, 74, 75, 80, 81, 82, 95, 96, 99];
        return $weatherCodes->filter(fn ($code) => in_array($code, $extremeCodes))->count();
    }

    /**
     * Obtiene descripción del código climático
     */
    private function getWeatherDescription(?int $code): string
    {
        $descriptions = [
            0 => 'Despejado',
            1 => 'Mayormente despejado',
            2 => 'Parcialmente nublado',
            3 => 'Nublado',
            45 => 'Niebla',
            51 => 'Llovizna ligera',
            61 => 'Lluvia ligera',
            65 => 'Lluvia intensa',
            71 => 'Nieve ligera',
            80 => 'Chubascos',
            95 => 'Tormenta',
        ];
        return $descriptions[$code] ?? 'Condición desconocida';
    }

    /**
     * Calcula tendencia (subiendo, bajando, estable)
     */
    private function calculateTrend(Collection $values): string
    {
        if ($values->count() < 2) {
            return 'stable';
        }

        $first = $values->slice(-5)->average();
        $last = $values->slice(0, 5)->average();
        $diff = $last - $first;

        if ($diff > 2) {
            return 'increasing';
        } elseif ($diff < -2) {
            return 'decreasing';
        }
        return 'stable';
    }

    /**
     * Obtiene ubicaciones típicas del usuario
     */
    private function getTypicalLocations(Collection $weatherLogs): array
    {
        return $weatherLogs
            ->pluck('address')
            ->filter()
            ->unique()
            ->take(5)
            ->values()
            ->toArray();
    }
}
