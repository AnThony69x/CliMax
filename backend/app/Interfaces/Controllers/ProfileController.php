<?php

namespace App\Interfaces\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Profile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProfileController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $supabaseUser = $request->attributes->get('supabase_user');
        $supabaseUserId = $supabaseUser['id'] ?? null;

        if (! is_string($supabaseUserId) || $supabaseUserId === '') {
            return response()->json([
                'message' => 'No se pudo resolver el usuario autenticado.',
            ], 401);
        }

        $defaults = [
            'name' => $supabaseUser['user_metadata']['name']
                ?? $supabaseUser['user_metadata']['full_name']
                ?? null,
            'avatar_url' => $supabaseUser['user_metadata']['avatar_url'] ?? null,
        ];

        $profile = Profile::query()->firstOrCreate(['id' => $supabaseUserId], $defaults);

        return response()->json([
            'data' => $this->toResponse($profile, $supabaseUser),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $supabaseUser = $request->attributes->get('supabase_user');
        $supabaseUserId = $supabaseUser['id'] ?? null;

        if (! is_string($supabaseUserId) || $supabaseUserId === '') {
            return response()->json([
                'message' => 'No se pudo resolver el usuario autenticado.',
            ], 401);
        }

        $validatedData = $request->validate([
            'name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'avatar_url' => ['sometimes', 'nullable', 'url', 'max:2048'],
        ]);

        $profile = Profile::query()->firstOrCreate(
            ['id' => $supabaseUserId],
            []
        );

        $profile->fill($validatedData);
        $profile->save();

        return response()->json([
            'data' => $this->toResponse($profile, $supabaseUser),
        ]);
    }

    private function toResponse(Profile $profile, array $supabaseUser): array
    {
        $fallbackName = $supabaseUser['user_metadata']['name']
            ?? $supabaseUser['user_metadata']['full_name']
            ?? null;
        $fallbackAvatar = $supabaseUser['user_metadata']['avatar_url'] ?? null;

        return [
            'id' => $profile->id,
            'email' => $supabaseUser['email'] ?? null,
            'phone' => $supabaseUser['phone'] ?? null,
            'name' => $profile->name ?: $fallbackName,
            'avatar_url' => $profile->avatar_url ?: $fallbackAvatar,
            'created_at' => $profile->created_at ?? ($supabaseUser['created_at'] ?? null),
            'updated_at' => $profile->updated_at ?? ($supabaseUser['updated_at'] ?? null),
        ];
    }
}
