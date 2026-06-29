<?php

namespace App\Http\Middleware;

use App\Http\Traits\ResolvesSupabaseUser;
use App\Services\AccessControlService;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireStaffRole
{
    use ResolvesSupabaseUser;

    public function handle(Request $request, Closure $next, string ...$roles): Response|JsonResponse
    {
        $userId = $this->resolveSupabaseUserId($request);

        if (! app(AccessControlService::class)->hasStaffRole($userId, $roles)) {
            return response()->json([
                'message' => 'No tienes permisos suficientes para esta accion.',
            ], 403);
        }

        return $next($request);
    }
}
