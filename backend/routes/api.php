<?php

use App\Interfaces\Controllers\AuthController;
use App\Interfaces\Controllers\ClimaController;
use App\Interfaces\Controllers\MeController;
use App\Interfaces\Controllers\ProfileController;
use App\Interfaces\Controllers\WeatherLogController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/register', [AuthController::class, 'register']);
});

Route::middleware('supabase.auth')->group(function () {
    Route::get('/me', [MeController::class, 'show']);
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::patch('/profile', [ProfileController::class, 'update']);
});

Route::get('/clima', [ClimaController::class, 'getClima']);
Route::get('/geocode', [ClimaController::class, 'getAddress']);
Route::post('/location', [WeatherLogController::class, 'store']);
