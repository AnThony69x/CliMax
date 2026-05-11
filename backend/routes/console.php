<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/**
 * Procesar alertas inteligentes cada 30 minutos.
 * Analiza logs climaticos con Groq y dispara push para alertas high/severe.
 */
Schedule::command('alerts:process-intelligent')
    ->everyThirtyMinutes()
    ->withoutOverlapping()
    ->onOneServer();

/**
 * Vigilar cambios bruscos del clima cada 15 minutos y disparar push proactivos.
 */
Schedule::command('weather:monitor')
    ->everyFifteenMinutes()
    ->withoutOverlapping()
    ->onOneServer();

/**
 * Verificar receipts asincronos de Expo cada 30 min para confirmar entrega
 * y purgar tokens invalidos (DeviceNotRegistered, etc).
 */
Schedule::command('push:check-receipts')
    ->everyThirtyMinutes()
    ->withoutOverlapping()
    ->onOneServer();

/**
 * Limpieza semanal de tokens push sin actividad hace mas de 30 dias.
 */
Schedule::command('push:cleanup-tokens')
    ->weekly()
    ->mondays()
    ->at('03:00')
    ->onOneServer();
