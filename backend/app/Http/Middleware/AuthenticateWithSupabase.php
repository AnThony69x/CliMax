<?php

namespace App\Http\Middleware;

use App\Models\UserAccountModeration;
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

        $accountBlock = $this->activeAccountBlock((string) $user['id']);
        if ($accountBlock) {
            return response()->json([
                'message' => $this->accountBlockMessage($accountBlock['status']),
                'code' => 'account_'.$accountBlock['status'],
                'data' => [
                    'status' => $accountBlock['status'],
                    'reason' => $accountBlock['reason'],
                    'suspended_until' => $accountBlock['suspended_until'],
                ],
            ], 403);
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

    /** @return array{status: string, reason: string|null, suspended_until: string|null}|null */
    private function activeAccountBlock(string $userId): ?array
    {
        $moderation = UserAccountModeration::query()
            ->where('user_id', $userId)
            ->whereIn('status', ['suspended', 'banned', 'deleted'])
            ->first();

        if (! $moderation) {
            return null;
        }

        if ($moderation->status === 'suspended' && $moderation->suspended_until && $moderation->suspended_until->isPast()) {
            $moderation->update([
                'status' => 'active',
                'reason' => null,
                'suspended_until' => null,
            ]);

            return null;
        }

        return [
            'status' => $moderation->status,
            'reason' => $moderation->reason,
            'suspended_until' => $moderation->suspended_until?->toISOString(),
        ];
    }

    private function accountBlockMessage(string $status): string
    {
        return match ($status) {
            'suspended' => 'Tu cuenta esta suspendida temporalmente.',
            'banned' => 'Tu cuenta fue baneada por infringir las normas de la aplicacion.',
            'deleted' => 'Tu cuenta fue eliminada por administracion.',
            default => 'Tu cuenta no puede acceder en este momento.',
        };
    }
}
