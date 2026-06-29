<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SubscriptionCheckoutSession extends Model
{
    protected $fillable = [
        'user_id',
        'subscription_plan_id',
        'billing_interval',
        'amount_cents',
        'currency',
        'payment_provider',
        'provider_session_id',
        'checkout_url',
        'status',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'amount_cents' => 'integer',
            'completed_at' => 'datetime',
        ];
    }
}
