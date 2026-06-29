<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CommunityPost extends Model
{
    protected $table = 'community_posts';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'user_id',
        'content',
        'image_url',
        'image_path',
        'image_hash',
        'severity',
        'moderation_status',
        'moderated_by',
        'moderated_at',
        'moderation_reason',
    ];

    protected function casts(): array
    {
        return [
            'moderated_at' => 'datetime',
        ];
    }
}
