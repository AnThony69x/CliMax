<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FeatureEntitlement extends Model
{
    protected $fillable = [
        'subscription_plan_id',
        'professional_sector',
        'feature_key',
        'enabled',
    ];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
        ];
    }
}
