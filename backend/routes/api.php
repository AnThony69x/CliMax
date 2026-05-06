<?php

use App\Interfaces\Controllers\ClimaController;
use App\Interfaces\Controllers\IntelligentAlertController;
use App\Interfaces\Controllers\MeController;
use App\Interfaces\Controllers\ProfileController;
use App\Interfaces\Controllers\WeatherLogController;
use Illuminate\Support\Facades\Route;

Route::middleware('supabase.auth')->group(function () {
    Route::get('/me', [MeController::class, 'show']);
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::patch('/profile', [ProfileController::class, 'update']);
});

// Rutas de Alertas Inteligentes (con autenticación dual: Sanctum + Supabase)
Route::middleware('auth.intelligent')->group(function () {
    Route::get('/intelligent-alerts', [IntelligentAlertController::class, 'index']);
    Route::get('/intelligent-alerts/unread', [IntelligentAlertController::class, 'unread']);
    Route::get('/intelligent-alerts/high-risk', [IntelligentAlertController::class, 'highRisk']);
    Route::get('/intelligent-alerts/summary', [IntelligentAlertController::class, 'summary']);
    Route::get('/intelligent-alerts/history', [IntelligentAlertController::class, 'history']);
    Route::get('/intelligent-alerts/{id}', [IntelligentAlertController::class, 'show']);
    Route::post('/intelligent-alerts/{id}/feedback', [IntelligentAlertController::class, 'feedback']);
});

Route::get('/clima', [ClimaController::class, 'getClima']);
Route::get('/geocode', [ClimaController::class, 'getAddress']);
Route::get('/search', [ClimaController::class, 'searchCities']);
Route::post('/location', [WeatherLogController::class, 'store']);
