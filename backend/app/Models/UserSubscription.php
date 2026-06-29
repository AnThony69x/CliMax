<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Model;

class UserSubscription extends Model
{
    protected $fillable = [
        'user_id',
        'subscription_plan_id',
        'status',
        'starts_at',
        'expires_at',
        'assigned_by',
        'billing_interval',
        'payment_provider',
        'provider_customer_id',
        'provider_subscription_id',
        'provider_checkout_session_id',
    ];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'expires_at' => 'datetime',
        ];
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(SubscriptionPlan::class, 'subscription_plan_id');
    }
}
