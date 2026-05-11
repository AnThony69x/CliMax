<?php

namespace App\Console\Commands;

use App\Models\PushToken;
use Illuminate\Console\Command;

class CleanupPushTokens extends Command
{
    protected $signature = 'push:cleanup-tokens {--days=30 : Borrar tokens sin actividad hace mas de N dias}';
    protected $description = 'Elimina ExpoPushTokens viejos sin uso reciente';

    public function handle(): int
    {
        $days = max(0, (int) $this->option('days'));
        $cutoff = now()->subDays($days);

        $deleted = PushToken::where('created_at', '<', $cutoff)
            ->where(function ($query) use ($cutoff) {
                $query->where('last_used_at', '<', $cutoff)
                    ->orWhereNull('last_used_at');
            })
            ->delete();

        $this->info("Tokens eliminados (>{$days}d sin uso): {$deleted}");
        return 0;
    }
}
