<?php

namespace App\Interfaces\Controllers;

use App\Http\Controllers\Controller;
use App\Services\AccessControlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MeController extends Controller
{
    public function show(Request $request, AccessControlService $accessControl): JsonResponse
    {
        $user = $request->attributes->get('supabase_user');
        $userId = $user['id'] ?? null;

        return response()->json([
            'data' => [
                'id' => $userId,
                'email' => $user['email'] ?? null,
                'phone' => $user['phone'] ?? null,
                'created_at' => $user['created_at'] ?? null,
                'updated_at' => $user['updated_at'] ?? null,
                'access' => $accessControl->resolveForUser(is_string($userId) ? $userId : null),
            ],
        ]);
    }
}
