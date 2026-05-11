<?php

namespace App\Console\Commands;

use App\Models\PushNotificationLog;
use App\Services\ExpoPushService;
use Illuminate\Console\Command;

class CheckPushReceipts extends Command
{
    protected $signature = 'push:check-receipts {--limit=500 : Maximo de logs a procesar por corrida}';
    protected $description = 'Consulta receipts asincronos de Expo Push y borra tokens invalidos';

    private const INVALID_ERRORS = ['DeviceNotRegistered', 'InvalidCredentials', 'MismatchSenderId'];
    private const SENT_AGE_MIN_MINUTES = 30;
    private const SENT_AGE_MAX_HOURS = 24;

    public function handle(ExpoPushService $expoPush): int
    {
        $limit = (int) $this->option('limit');

        $logs = PushNotificationLog::pendingReceipts()
            ->where('sent_at', '<=', now()->subMinutes(self::SENT_AGE_MIN_MINUTES))
            ->where('sent_at', '>=', now()->subHours(self::SENT_AGE_MAX_HOURS))
            ->orderBy('sent_at')
            ->limit($limit)
            ->get();

        if ($logs->isEmpty()) {
            $this->info('Sin logs pendientes de receipts.');
            return 0;
        }

        $this->info('Procesando ' . $logs->count() . ' log(s).');

        $allTicketIds = [];
        foreach ($logs as $log) {
            foreach ((array) $log->ticket_ids as $id) {
                if (is_string($id) && $id !== '') {
                    $allTicketIds[] = $id;
                }
            }
        }

        if (empty($allTicketIds)) {
            $logs->each(fn (PushNotificationLog $log) => $log->update(['receipts_checked_at' => now()]));
            $this->warn('Logs sin ticket_ids: marcados como verificados.');
            return 0;
        }

        $receiptsByTicketId = $expoPush->fetchReceipts($allTicketIds);

        if (empty($receiptsByTicketId)) {
            $this->warn('Expo no devolvio receipts.');
            return 0;
        }

        $tokensDeleted = 0;
        $logsUpdated = 0;

        foreach ($logs as $log) {
            $ticketIds = (array) $log->ticket_ids;
            $recipientTokens = (array) $log->recipient_tokens;
            $hasError = false;
            $hasOk = false;
            $errorMessage = null;

            foreach ($ticketIds as $ticketId) {
                if (! isset($receiptsByTicketId[$ticketId])) {
                    continue;
                }
                $receipt = $receiptsByTicketId[$ticketId];
                if (! is_array($receipt)) {
                    continue;
                }
                $status = $receipt['status'] ?? null;
                if ($status === 'ok') {
                    $hasOk = true;
                    continue;
                }
                if ($status === 'error') {
                    $hasError = true;
                    $errorCode = $receipt['details']['error'] ?? null;
                    $errorMessage = $errorMessage ?? ($receipt['message'] ?? $errorCode);

                    if (in_array($errorCode, self::INVALID_ERRORS, true)) {
                        $tokenForTicket = $this->resolveTokenForTicket($ticketId, $ticketIds, $recipientTokens);
                        if ($tokenForTicket !== null) {
                            $expoPush->deleteTokenByValue($tokenForTicket);
                            $tokensDeleted++;
                        }
                    }
                }
            }

            $newStatus = match (true) {
                $hasOk && ! $hasError => 'sent',
                $hasOk && $hasError => 'partial',
                $hasError && ! $hasOk => 'failed',
                default => $log->status,
            };

            $log->update([
                'status' => $newStatus,
                'error_message' => $errorMessage ?? $log->error_message,
                'receipts_checked_at' => now(),
            ]);
            $logsUpdated++;
        }

        $this->info("Logs actualizados: $logsUpdated | Tokens eliminados: $tokensDeleted");
        return 0;
    }

    /**
     * Mapea ticketId -> token usando la posicion en ambos arrays.
     */
    private function resolveTokenForTicket(string $ticketId, array $ticketIds, array $recipientTokens): ?string
    {
        $position = array_search($ticketId, $ticketIds, true);
        if ($position === false) {
            return null;
        }

        // recipient_tokens guardado por sendToTokens es un mapa indexado por posicion del ticket en chunk;
        // pero sendToUsers solo persiste los OK en ticket_ids. Reconstruimos buscando por posicion absoluta.
        if (isset($recipientTokens[$position])) {
            return is_string($recipientTokens[$position]) ? $recipientTokens[$position] : null;
        }

        // Fallback: si el mapa tiene mas tokens que ticket_ids (porque algunos fallaron), no podemos
        // resolver con certeza. Devolvemos null para no borrar el token equivocado.
        return null;
    }
}
