<?php

namespace App\Http\Middleware;

use Closure;
use GuzzleHttp\Client;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateWithSupabase
{
    public function handle(Request $request, Closure $next): Response|JsonResponse
    {
        $token = $this->extractBearerToken($request);

        if (! $token) {
            return response()->json([
                'message' => 'Falta el access token de Supabase.',
            ], 401);
        }

        $user = $this->getUserFromToken($token);

        if (! $user) {
            return response()->json([
                'message' => 'Token de Supabase invalido o expirado.',
            ], 401);
        }

        $request->attributes->set('supabase_user', $user);
        $request->setUserResolver(static fn () => $user);

        return $next($request);
    }

    private function extractBearerToken(Request $request): ?string
    {
        $authorizationHeader = $request->header('Authorization', '');

        if (! preg_match('/^Bearer\s+(.*)$/i', $authorizationHeader, $matches)) {
            return null;
        }

        $token = trim($matches[1]);

        return $token !== '' ? $token : null;
    }

    private function getUserFromToken(string $token): ?array
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

            if (! is_array($decodedResponse) || ! isset($decodedResponse['id'])) {
                return null;
            }

            Cache::put($cacheKey, $decodedResponse, now()->addMinutes(5));

            return $decodedResponse;
        } catch (\Throwable) {
            return null;
        }
    }
}
