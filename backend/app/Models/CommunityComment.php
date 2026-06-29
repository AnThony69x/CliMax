<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CommunityComment extends Model
{
    protected $table = 'community_comments';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'post_id',
        'user_id',
        'content',
        'parent_comment_id',
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
