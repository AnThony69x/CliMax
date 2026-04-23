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

        $profile = Profile::query()->firstOrCreate(
            ['id' => $supabaseUserId],
            []
        );

        return response()->json([
            'data' => $this->toResponse($profile),
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
            'data' => $this->toResponse($profile),
        ]);
    }

    private function toResponse(Profile $profile): array
    {
        return [
            'id' => $profile->id,
            'name' => $profile->name,
            'avatar_url' => $profile->avatar_url,
            'created_at' => $profile->created_at,
            'updated_at' => $profile->updated_at,
        ];
    }
}
