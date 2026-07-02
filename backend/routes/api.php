<?php

use App\Interfaces\Controllers\AdminAccessController;
use App\Interfaces\Controllers\BillingController;
use App\Interfaces\Controllers\ClimaController;
use App\Interfaces\Controllers\CommunityController;
use App\Interfaces\Controllers\IntelligentAlertController;
use App\Interfaces\Controllers\MeController;
use App\Interfaces\Controllers\OperatorCommunityController;
use App\Interfaces\Controllers\ProfileController;
use App\Interfaces\Controllers\PushTokenController;
use App\Interfaces\Controllers\WeatherHistoryController;
use App\Interfaces\Controllers\WeatherLogController;
use Illuminate\Support\Facades\Route;

Route::middleware('supabase.auth')->group(function () {
    Route::get('/me', [MeController::class, 'show']);
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::patch('/profile', [ProfileController::class, 'update']);

    Route::middleware('require.entitlement:community.basic')->prefix('community')->group(function () {
        Route::get('/posts', [CommunityController::class, 'index']);
        Route::post('/posts', [CommunityController::class, 'storePost']);
        Route::patch('/posts/{postId}', [CommunityController::class, 'updatePost']);
        Route::delete('/posts/{postId}', [CommunityController::class, 'deletePost']);
        Route::post('/posts/{postId}/comments', [CommunityController::class, 'storeComment']);
        Route::patch('/posts/{postId}/comments/{commentId}', [CommunityController::class, 'updateComment']);
        Route::delete('/posts/{postId}/comments/{commentId}', [CommunityController::class, 'deleteComment']);
        Route::post('/reports', [CommunityController::class, 'report']);
    });

    Route::prefix('billing')->group(function () {
        Route::get('/plans', [BillingController::class, 'plans']);
        Route::post('/checkout', [BillingController::class, 'checkout']);
        Route::post('/sync-checkout', [BillingController::class, 'syncCheckout']);
        Route::post('/simulate-success', [BillingController::class, 'simulateSuccess']);
    });

    Route::post('/push-tokens', [PushTokenController::class, 'store']);
    Route::delete('/push-tokens/{token}', [PushTokenController::class, 'destroy'])
        ->where('token', '.*');

    Route::middleware('require.staff:admin')->prefix('admin')->group(function () {
        Route::get('/dashboard', [AdminAccessController::class, 'dashboard']);
        Route::get('/users', [AdminAccessController::class, 'users']);
        Route::patch('/users/{id}/role', [AdminAccessController::class, 'updateRole']);
        Route::patch('/users/{id}/subscription', [AdminAccessController::class, 'updateSubscription']);
        Route::get('/plans', [AdminAccessController::class, 'plans']);
        Route::patch('/plans/{key}', [AdminAccessController::class, 'updatePlan']);
        Route::get('/audit-logs', [AdminAccessController::class, 'auditLogs']);
    });

    Route::middleware('require.staff:admin,operator')->prefix('operator')->group(function () {
        Route::get('/users', [OperatorCommunityController::class, 'users']);
        Route::patch('/users/{id}/status', [OperatorCommunityController::class, 'updateUserStatus']);
        Route::get('/community/posts', [OperatorCommunityController::class, 'posts']);
        Route::patch('/community/posts/{id}/moderation', [OperatorCommunityController::class, 'moderate']);
        Route::patch('/community/comments/{id}/moderation', [OperatorCommunityController::class, 'moderateComment']);
    });

    Route::middleware('require.entitlement:weather.history.extended')->group(function () {
        Route::get('/weather/history', [WeatherHistoryController::class, 'index']);
        Route::get('/weather/history/summary', [WeatherHistoryController::class, 'summary']);
        Route::get('/weather/history/export', [WeatherHistoryController::class, 'export'])
            ->middleware('require.entitlement:weather.history.export');
    });
});

// Rutas de Alertas Inteligentes (con autenticación dual: Sanctum + Supabase)
Route::post('/billing/stripe/webhook', [BillingController::class, 'stripeWebhook']);

Route::middleware(['auth.intelligent', 'require.entitlement:alerts.basic'])->group(function () {
    Route::get('/intelligent-alerts', [IntelligentAlertController::class, 'index']);
    Route::post('/intelligent-alerts/analyze-location', [IntelligentAlertController::class, 'analyzeLocation']);
    Route::get('/intelligent-alerts/unread', [IntelligentAlertController::class, 'unread']);

    Route::middleware('require.entitlement:alerts.advanced')->group(function () {
        Route::get('/intelligent-alerts/high-risk', [IntelligentAlertController::class, 'highRisk']);
        Route::get('/intelligent-alerts/summary', [IntelligentAlertController::class, 'summary']);
        Route::get('/intelligent-alerts/history', [IntelligentAlertController::class, 'history']);
        Route::post('/intelligent-alerts/{id}/feedback', [IntelligentAlertController::class, 'feedback']);
    });

    Route::get('/intelligent-alerts/{id}', [IntelligentAlertController::class, 'show']);
});

Route::get('/clima', [ClimaController::class, 'getClima']);
Route::get('/geocode', [ClimaController::class, 'getAddress']);
Route::get('/search', [ClimaController::class, 'searchCities']);
Route::post('/location', [WeatherLogController::class, 'store']);
