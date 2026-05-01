<?php

use App\Interfaces\Controllers\ClimaController;
use App\Interfaces\Controllers\MeController;
use App\Interfaces\Controllers\ProfileController;
use App\Interfaces\Controllers\WeatherLogController;
use Illuminate\Support\Facades\Route;

Route::middleware('supabase.auth')->group(function () {
    Route::get('/me', [MeController::class, 'show']);
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::patch('/profile', [ProfileController::class, 'update']);
});

Route::get('/clima', [ClimaController::class, 'getClima']);
Route::get('/geocode', [ClimaController::class, 'getAddress']);
Route::get('/search', [ClimaController::class, 'searchCities']);
Route::post('/location', [WeatherLogController::class, 'store']);
