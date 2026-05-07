<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    /**
     * Define the application's command schedule.
     */
    protected function schedule(Schedule $schedule): void
    {
        /**
         * Procesar alertas inteligentes cada hora
         * Analiza logs climáticos con Groq y genera alertas personalizadas
         */
        $schedule->command('alerts:process-intelligent')
            ->hourly()
            ->withoutOverlapping()
            ->onOneServer();

        /**
         * Procesar alertas cada 30 minutos para usuarios con actividad reciente
         */
        $schedule->command('alerts:process-intelligent')
            ->everyThirtyMinutes()
            ->withoutOverlapping()
            ->onOneServer();
    }

    /**
     * Register the commands for the application.
     */
    protected function commands(): void
    {
        $this->load(__DIR__ . '/Commands');

        require base_path('routes/console.php');
    }
}
