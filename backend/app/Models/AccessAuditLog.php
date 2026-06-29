<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AccessAuditLog extends Model
{
    protected $fillable = [
        'actor_user_id',
        'target_user_id',
        'action',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
        ];
    }
}
