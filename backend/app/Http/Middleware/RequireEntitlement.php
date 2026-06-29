<?php

namespace App\Http\Middleware;

use App\Http\Traits\ResolvesSupabaseUser;
use App\Services\AccessControlService;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireEntitlement
{
    use ResolvesSupabaseUser;

    public function handle(Request $request, Closure $next, string $feature): Response|JsonResponse
    {
        $userId = $this->resolveSupabaseUserId($request);

        if (! app(AccessControlService::class)->hasEntitlement($userId, $feature)) {
            return response()->json([
                'message' => 'Tu plan actual no incluye esta funcion.',
                'required_entitlement' => $feature,
            ], 403);
        }

        return $next($request);
    }
}
