<?php

namespace App\Interfaces\Controllers;

use App\Http\Controllers\Controller;
use App\Http\Traits\ResolvesSupabaseUser;
use App\Models\PushToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PushTokenController extends Controller
{
    use ResolvesSupabaseUser;

    /**
     * Registrar (upsert) el ExpoPushToken del dispositivo del usuario.
     * POST /api/push-tokens
     */
    public function store(Request $request): JsonResponse
    {
        $userId = $this->resolveSupabaseUserId($request);

        if (! $userId) {
            return response()->json(['message' => 'No autenticado.'], 401);
        }

        $validated = $request->validate([
            'token' => ['required', 'string', 'regex:/^ExponentPushToken\[.+\]$/'],
            'platform' => ['required', 'in:ios,android,web'],
        ]);

        $pushToken = PushToken::updateOrCreate(
            ['token' => $validated['token']],
            [
                'user_id' => $userId,
                'platform' => $validated['platform'],
                'last_used_at' => now(),
            ]
        );

        return response()->json([
            'data' => $pushToken,
        ], $pushToken->wasRecentlyCreated ? 201 : 200);
    }

    /**
     * Borrar el token del dispositivo (al hacer logout).
     * DELETE /api/push-tokens/{token}
     */
    public function destroy(Request $request, string $token): JsonResponse
    {
        $userId = $this->resolveSupabaseUserId($request);

        if (! $userId) {
            return response()->json(['message' => 'No autenticado.'], 401);
        }

        PushToken::where('token', $token)
            ->where('user_id', $userId)
            ->delete();

        return response()->json(null, 204);
    }
}
