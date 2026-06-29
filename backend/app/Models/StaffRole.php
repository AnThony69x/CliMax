<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StaffRole extends Model
{
    protected $fillable = [
        'user_id',
        'role',
        'assigned_by',
        'assigned_at',
    ];

    protected function casts(): array
    {
        return [
            'assigned_at' => 'datetime',
        ];
    }
}
