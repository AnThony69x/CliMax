<?php

use App\Interfaces\Controllers\BillingController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
	return response()->json([
		'message' => 'Backend listo',
		'status' => 'ok',
	]);
});

Route::get('/billing/return', [BillingController::class, 'returnFromCheckout']);
