<?php

namespace App\Services;

use App\Models\PushNotificationLog;
use App\Models\PushToken;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ExpoPushService
{
    private const SEND_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
    private const RECEIPTS_ENDPOINT = 'https://exp.host/--/api/v2/push/getReceipts';
    private const SEND_CHUNK = 100;
    private const RECEIPTS_CHUNK = 1000;
    private const ANDROID_CHANNEL = 'default';

    /**
     * Envia push a una lista de ExpoPushTokens.
     *
     * Devuelve la lista plana de tickets recibidos (uno por destinatario en orden).
     * NO persiste log: usar sendToUsers(...) si quieres auditoria automatica.
     */
    public function sendToTokens(
        array $tokens,
        string $title,
        string $body,
        array $data = [],
        string $sound = 'default'
    ): array {
        $valid = array_values(array_filter(
            array_unique($tokens),
            static fn ($token) => is_string($token) && str_starts_with($token, 'ExponentPushToken[')
        ));

        if (empty($valid)) {
            return ['tickets' => [], 'recipient_tokens' => []];
        }

        $allTickets = [];
        $recipientByPosition = [];

        foreach (array_chunk($valid, self::SEND_CHUNK) as $chunk) {
            $messages = array_map(static fn ($token) => [
                'to' => $token,
                'title' => $title,
                'body' => $body,
                'data' => $data,
                'sound' => $sound,
                'channelId' => self::ANDROID_CHANNEL,
                'priority' => 'high',
            ], $chunk);

            try {
                $response = $this->httpClient()->post(self::SEND_ENDPOINT, $messages);
            } catch (\Throwable $exception) {
                Log::warning('ExpoPushService: error de red enviando chunk', [
                    'count' => count($chunk),
                    'error' => $exception->getMessage(),
                ]);
                continue;
            }

            if (! $response->successful()) {
                Log::warning('ExpoPushService: respuesta no exitosa', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
                continue;
            }

            $tickets = $response->json('data') ?? [];

            foreach ($tickets as $position => $ticket) {
                $tokenForTicket = $chunk[$position] ?? null;
                if ($tokenForTicket !== null) {
                    $recipientByPosition[count($allTickets)] = $tokenForTicket;
                }
                $allTickets[] = $ticket;
            }

            Log::info('ExpoPushService: chunk enviado', [
                'count' => count($chunk),
                'tickets' => count($tickets),
            ]);
        }

        $this->pruneInvalidTokens($allTickets, $recipientByPosition);

        return [
            'tickets' => $allTickets,
            'recipient_tokens' => $recipientByPosition,
        ];
    }

    /**
     * Busca tokens activos de los user_ids dados, respeta quiet hours y persiste en
     * push_notifications_log. Retorna numero de devices a los que se envio (0 si quiet hours).
     *
     * @param array<string,mixed> $logMeta extras: kind, alert_id, change_type
     */
    public function sendToUsers(
        array $userIds,
        string $title,
        string $body,
        array $data = [],
        string $sound = 'default',
        bool $bypassQuietHours = false,
        array $logMeta = []
    ): int {
        $userIds = array_values(array_filter($userIds, static fn ($id) => is_string($id) && $id !== ''));

        if (empty($userIds)) {
            return 0;
        }

        $kind = $logMeta['kind'] ?? 'manual';
        $alertId = $logMeta['alert_id'] ?? null;
        $changeType = $logMeta['change_type'] ?? null;

        $tokens = PushToken::whereIn('user_id', $userIds)
            ->expoTokens()
            ->pluck('token')
            ->all();

        if (empty($tokens)) {
            return 0;
        }

        if (! $bypassQuietHours && $this->isQuietHoursNow()) {
            foreach ($userIds as $uid) {
                PushNotificationLog::create([
                    'user_id' => $uid,
                    'kind' => $kind,
                    'alert_id' => $alertId,
                    'change_type' => $changeType,
                    'title' => $title,
                    'body' => $body,
                    'data' => $data,
                    'tokens_count' => count($tokens),
                    'ticket_ids' => null,
                    'recipient_tokens' => null,
                    'status' => 'queued',
                    'error_message' => 'Skipped por quiet hours',
                    'sent_at' => null,
                ]);
            }
            Log::info('ExpoPushService: skip por quiet hours', [
                'users' => $userIds,
                'tokens' => count($tokens),
            ]);
            return 0;
        }

        $result = $this->sendToTokens($tokens, $title, $body, $data, $sound);
        $tickets = $result['tickets'];
        $recipientByPosition = $result['recipient_tokens'];

        $ticketIds = [];
        $hasErrors = false;
        $hasOk = false;
        $firstError = null;

        foreach ($tickets as $position => $ticket) {
            if (! is_array($ticket)) {
                $hasErrors = true;
                continue;
            }
            if (($ticket['status'] ?? null) === 'ok' && isset($ticket['id'])) {
                $ticketIds[] = $ticket['id'];
                $hasOk = true;
            } else {
                $hasErrors = true;
                if ($firstError === null && isset($ticket['message'])) {
                    $firstError = $ticket['message'];
                }
            }
        }

        $status = match (true) {
            $hasOk && ! $hasErrors => 'sent',
            $hasOk && $hasErrors => 'partial',
            default => 'failed',
        };

        foreach ($userIds as $uid) {
            PushNotificationLog::create([
                'user_id' => $uid,
                'kind' => $kind,
                'alert_id' => $alertId,
                'change_type' => $changeType,
                'title' => $title,
                'body' => $body,
                'data' => $data,
                'tokens_count' => count($tokens),
                'ticket_ids' => $ticketIds ?: null,
                'recipient_tokens' => $recipientByPosition ?: null,
                'status' => $status,
                'error_message' => $firstError,
                'sent_at' => now(),
            ]);
        }

        return count($tokens);
    }

    /**
     * Consulta los receipts asincronos en Expo. Devuelve un mapa ticketId => receipt.
     */
    public function fetchReceipts(array $ticketIds): array
    {
        $ticketIds = array_values(array_unique(array_filter($ticketIds, static fn ($id) => is_string($id) && $id !== '')));

        if (empty($ticketIds)) {
            return [];
        }

        $allReceipts = [];

        foreach (array_chunk($ticketIds, self::RECEIPTS_CHUNK) as $chunk) {
            try {
                $response = $this->httpClient()->post(self::RECEIPTS_ENDPOINT, ['ids' => $chunk]);
            } catch (\Throwable $exception) {
                Log::warning('ExpoPushService: error de red consultando receipts', [
                    'count' => count($chunk),
                    'error' => $exception->getMessage(),
                ]);
                continue;
            }

            if (! $response->successful()) {
                Log::warning('ExpoPushService: receipts no exitosos', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
                continue;
            }

            $receipts = $response->json('data') ?? [];
            foreach ($receipts as $ticketId => $receipt) {
                $allReceipts[$ticketId] = $receipt;
            }
        }

        return $allReceipts;
    }

    /**
     * Borra de la BD tokens marcados como invalidos por Expo.
     *
     * @param array<int,string> $recipientByPosition  posicion del ticket -> token enviado
     */
    public function pruneInvalidTokens(array $tickets, array $recipientByPosition): void
    {
        $invalidErrors = ['DeviceNotRegistered', 'InvalidCredentials', 'MismatchSenderId'];
        $tokensToDelete = [];

        foreach ($tickets as $position => $ticket) {
            if (! is_array($ticket)) {
                continue;
            }

            $status = $ticket['status'] ?? null;
            $errorCode = $ticket['details']['error'] ?? null;

            if ($status === 'error' && in_array($errorCode, $invalidErrors, true)) {
                $token = $recipientByPosition[$position] ?? null;
                if ($token !== null) {
                    $tokensToDelete[] = $token;
                }
            }
        }

        if (empty($tokensToDelete)) {
            return;
        }

        $deleted = PushToken::whereIn('token', $tokensToDelete)->delete();

        Log::info('ExpoPushService: tokens invalidos eliminados', [
            'deleted' => $deleted,
            'count' => count($tokensToDelete),
        ]);
    }

    /**
     * Borra un token especifico (para el caso de un receipt fallido).
     */
    public function deleteTokenByValue(string $token): void
    {
        if ($token === '') {
            return;
        }
        PushToken::where('token', $token)->delete();
    }

    private function isQuietHoursNow(): bool
    {
        $start = (int) config('services.expo.quiet_hours_start', 22);
        $end = (int) config('services.expo.quiet_hours_end', 7);
        $tz = (string) config('services.expo.timezone', 'America/Lima');

        try {
            $hour = Carbon::now($tz)->hour;
        } catch (\Throwable) {
            $hour = (int) date('G');
        }

        if ($start === $end) {
            return false;
        }

        if ($start < $end) {
            return $hour >= $start && $hour < $end;
        }

        // Ventana cruza medianoche, ej: 22..7
        return $hour >= $start || $hour < $end;
    }

    private function httpClient(): PendingRequest
    {
        $client = Http::acceptJson()
            ->withHeaders([
                'Accept-Encoding' => 'gzip, deflate',
                'Content-Type' => 'application/json',
            ])
            ->timeout(15)
            ->connectTimeout(5);

        $accessToken = config('services.expo.access_token');
        if (is_string($accessToken) && $accessToken !== '') {
            $client = $client->withToken($accessToken);
        }

        return $client;
    }
}
