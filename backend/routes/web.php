<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
	return response()->json([
		'message' => 'Backend listo',
		'status' => 'ok',
	]);
});
