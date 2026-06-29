<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserAccountModeration extends Model
{
    protected $fillable = [
        'user_id',
        'status',
        'reason',
        'actioned_by',
        'actioned_at',
        'suspended_until',
    ];

    protected function casts(): array
    {
        return [
            'actioned_at' => 'datetime',
            'suspended_until' => 'datetime',
        ];
    }
}
