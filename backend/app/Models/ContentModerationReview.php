<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContentModerationReview extends Model
{
    protected $fillable = [
        'target_type',
        'target_id',
        'author_user_id',
        'score',
        'decision',
        'labels',
        'reasons',
        'reviewed_by',
        'reviewed_at',
    ];

    protected function casts(): array
    {
        return [
            'labels' => 'array',
            'reasons' => 'array',
            'reviewed_at' => 'datetime',
        ];
    }
}
