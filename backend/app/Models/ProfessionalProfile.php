<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProfessionalProfile extends Model
{
    protected $fillable = [
        'user_id',
        'sector',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
        ];
    }
}
