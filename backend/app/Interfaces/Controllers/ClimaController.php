<?php

namespace App\Interfaces\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class ClimaController extends Controller
{
    public function getClima(): JsonResponse
    {
        return response()->json([
            'message' => 'Endpoint /clima base listo',
            'data' => [],
        ]);
    }
}
