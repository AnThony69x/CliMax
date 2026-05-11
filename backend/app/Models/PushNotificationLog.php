<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class PushNotificationLog extends Model
{
    protected $table = 'push_notifications_log';

    protected $fillable = [
        'user_id',
        'kind',
        'alert_id',
        'change_type',
        'title',
        'body',
        'data',
        'tokens_count',
        'ticket_ids',
        'recipient_tokens',
        'status',
        'error_message',
        'sent_at',
        'receipts_checked_at',
    ];

    protected function casts(): array
    {
        return [
            'data' => 'array',
            'ticket_ids' => 'array',
            'recipient_tokens' => 'array',
            'tokens_count' => 'integer',
            'sent_at' => 'datetime',
            'receipts_checked_at' => 'datetime',
        ];
    }

    public function scopePendingReceipts(Builder $query): Builder
    {
        return $query->where('status', 'sent')
            ->whereNull('receipts_checked_at')
            ->whereNotNull('ticket_ids');
    }
}
