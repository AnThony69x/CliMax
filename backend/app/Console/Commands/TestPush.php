<?php

namespace App\Console\Commands;

use App\Models\PushToken;
use App\Services\ExpoPushService;
use Illuminate\Console\Command;

class TestPush extends Command
{
    protected $signature = 'push:test
        {--user-id= : UUID del usuario al que enviar (usa tokens registrados)}
        {--token= : ExpoPushToken explicito (omite tabla push_tokens)}
        {--title=Test CliMax : Titulo del push}
        {--body=Mensaje de prueba : Body del push}
        {--bypass : Ignora quiet hours}';

    protected $description = 'Envia un push de prueba (atajo para debugging)';

    public function handle(ExpoPushService $expoPush): int
    {
        $userId = $this->option('user-id');
        $token = $this->option('token');
        $title = (string) $this->option('title');
        $body = (string) $this->option('body');
        $bypass = (bool) $this->option('bypass');

        if (! $userId && ! $token) {
            $this->error('Debes pasar --user-id o --token.');
            return 1;
        }

        if ($token) {
            $this->info("Enviando push directo a token explicito...");
            $result = $expoPush->sendToTokens([$token], $title, $body, ['debug' => true]);
            $this->line(json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            return 0;
        }

        $count = PushToken::where('user_id', $userId)->count();
        $this->info("Tokens registrados para user $userId: $count");

        if ($count === 0) {
            $this->warn('Sin tokens registrados. Instala el APK de development build y haz login para registrar uno.');
            $this->line('Alternativa: usa --token=ExponentPushToken[xxx] para forzar un envio.');
            return 0;
        }

        $sent = $expoPush->sendToUsers(
            [$userId],
            $title,
            $body,
            ['debug' => true],
            'default',
            $bypass,
            ['kind' => 'manual']
        );

        $this->info("Push despachado a $sent token(s).");
        $this->line('Revisa la fila mas reciente en push_notifications_log:');
        $this->line('  php artisan tinker --execute="echo json_encode(App\\\\Models\\\\PushNotificationLog::latest()->first(), JSON_PRETTY_PRINT);"');
        return 0;
    }
}
