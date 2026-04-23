<?php

namespace App\Interfaces\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MeController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $user = $request->attributes->get('supabase_user');

        return response()->json([
            'data' => [
                'id' => $user['id'] ?? null,
                'email' => $user['email'] ?? null,
                'phone' => $user['phone'] ?? null,
                'created_at' => $user['created_at'] ?? null,
                'updated_at' => $user['updated_at'] ?? null,
            ],
        ]);
    }
}
