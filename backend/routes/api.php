<?php

use App\Interfaces\Controllers\AuthController;
use App\Interfaces\Controllers\ClimaController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/register', [AuthController::class, 'register']);
});

Route::get('/clima', [ClimaController::class, 'getClima']);
