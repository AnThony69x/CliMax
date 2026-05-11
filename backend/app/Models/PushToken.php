<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class PushToken extends Model
{
    protected $fillable = [
        'user_id',
        'token',
        'platform',
        'last_used_at',
    ];

    protected function casts(): array
    {
        return [
            'last_used_at' => 'datetime',
        ];
    }

    public function scopeForUser(Builder $query, ?string $userId): Builder
    {
        return $query->where('user_id', $userId);
    }

    public function scopeExpoTokens(Builder $query): Builder
    {
        return $query->where('token', 'like', 'ExponentPushToken[%');
    }
}
