<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use GuzzleHttp\Client;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Middleware que autentica usuarios usando:
 * 1. Tokens de Sanctum (auth:sanctum)
 * 2. Tokens de Supabase JWT (fallback)
 * 
 * Permite que tanto la app móvil (Supabase auth) como clientes
 * de Sanctum accedan a los endpoints.
 */
class AuthenticateIntelligentAlerts
{
    public function handle(Request $request, Closure $next): Response|JsonResponse
    {
        // Intentar validar token con Sanctum
        $token = $request->bearerToken();
        
        if ($token) {
            // Verificar si es un token de Sanctum (formato: "1|xxxxxx")
            if (strpos($token, '|') !== false) {
                // Validar token de Sanctum manualmente
                try {
                    $user = $this->validateSanctumToken($token);
                    if ($user) {
                        $request->setUserResolver(static fn () => $user);
                        return $next($request);
                    }
                } catch (\Exception) {
                    // No es un token de Sanctum válido, intentar Supabase
                }
            }

            // Intentar validar como token de Supabase
            $supabaseUser = $this->getUserFromSupabaseToken($token);
            if ($supabaseUser) {
                $appUser = User::firstOrCreate(
                    ['id' => $supabaseUser['id']],
                    [
                        'email' => $supabaseUser['email'] ?? 'unknown@supabase.local',
                        'name' => $supabaseUser['user_metadata']['name'] ?? 'User',
                        'password' => bcrypt(Str::random(32)),
                    ]
                );

                $request->setUserResolver(static fn () => $appUser);
                return $next($request);
            }
        }

        return response()->json([
            'message' => 'No autorizado. Se requiere un token válido.',
        ], 401);
    }

    /**
     * Validar un token de Sanctum contra la base de datos
     */
    private function validateSanctumToken(string $token): ?User
    {
        // Los tokens de Sanctum se validan contra la tabla personal_access_tokens
        // Formato: "1|actual_token_hash"
        $parts = explode('|', $token, 2);
        if (count($parts) !== 2) {
            return null;
        }

        $tokenId = $parts[0];
        $tokenHash = hash('sha256', $parts[1]);

        // Buscar el token en la base de datos
        $accessToken = \Laravel\Sanctum\PersonalAccessToken::where('id', $tokenId)
            ->where('token', $tokenHash)
            ->first();

        if (!$accessToken) {
            return null;
        }

        // Obtener el usuario asociado al token
        return $accessToken->tokenable;
    }

    /**
     * Validar un token de Supabase
     */
    private function getUserFromSupabaseToken(string $token): ?array
    {
        $cacheKey = 'supabase_user:' . sha1($token);

        if (Cache::has($cacheKey)) {
            $cachedUser = Cache::get($cacheKey);
            return is_array($cachedUser) ? $cachedUser : null;
        }

        $supabaseUrl = rtrim((string) config('services.supabase.url'), '/');
        $supabaseAnonKey = (string) config('services.supabase.anon_key');

        if ($supabaseUrl === '' || $supabaseAnonKey === '') {
            return null;
        }

        try {
            $client = new Client([
                'timeout' => 5,
                'connect_timeout' => 3,
            ]);

            $response = $client->get($supabaseUrl . '/auth/v1/user', [
                'headers' => [
                    'apikey' => $supabaseAnonKey,
                    'Authorization' => 'Bearer ' . $token,
                    'Accept' => 'application/json',
                ],
            ]);

            if ($response->getStatusCode() !== 200) {
                return null;
            }

            $decodedResponse = json_decode((string) $response->getBody(), true);

            if (!is_array($decodedResponse) || !isset($decodedResponse['id'])) {
                return null;
            }

            Cache::put($cacheKey, $decodedResponse, now()->addMinutes(5));

            return $decodedResponse;
        } catch (\Throwable) {
            return null;
        }
    }
}

