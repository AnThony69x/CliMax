<?php

namespace App\Interfaces\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class AuthController extends Controller
{
    public function login(): JsonResponse
    {
        return response()->json([
            'message' => 'Login endpoint base listo',
        ]);
    }

    public function register(): JsonResponse
    {
        return response()->json([
            'message' => 'Register endpoint base listo',
        ]);
    }
}
