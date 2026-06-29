<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SubscriptionPlan extends Model
{
    protected $fillable = [
        'key',
        'name',
        'description',
        'currency',
        'monthly_price_cents',
        'yearly_price_cents',
        'stripe_monthly_price_id',
        'stripe_yearly_price_id',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'monthly_price_cents' => 'integer',
            'yearly_price_cents' => 'integer',
        ];
    }
}
