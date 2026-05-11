<?php

namespace App\Http\Traits;

use Illuminate\Http\Request;

trait ResolvesSupabaseUser
{
    /**
     * Resuelve el UUID del usuario autenticado.
     *
     * Intenta primero con request()->user() (Sanctum o middleware supabase.auth
     * que ya inyecta el resolver) y como fallback decodifica el payload del JWT
     * de Supabase sin verificar firma. La verificacion real la hacen los
     * middlewares supabase.auth / auth.intelligent.
     */
    protected function resolveSupabaseUserId(Request $request): ?string
    {
        $authenticated = $request->user();

        if ($authenticated) {
            $id = is_array($authenticated) ? ($authenticated['id'] ?? null) : ($authenticated->id ?? null);

            if (is_string($id) && $id !== '') {
                return $id;
            }
        }

        $token = $request->bearerToken();

        if (! $token) {
            return null;
        }

        $parts = explode('.', $token);

        if (count($parts) !== 3) {
            return null;
        }

        $payload = json_decode(
            base64_decode(str_pad(strtr($parts[1], '-_', '+/'), strlen($parts[1]) % 4, '=')),
            true
        );

        if (! is_array($payload) || ! isset($payload['sub']) || ! is_string($payload['sub'])) {
            return null;
        }

        return $payload['sub'];
    }
}
