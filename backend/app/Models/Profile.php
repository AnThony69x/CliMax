<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Model;

class Profile extends Model
{
    protected $table = 'profiles';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'name',
        'avatar_url',
    ];

    public function staffRole(): HasOne
    {
        return $this->hasOne(StaffRole::class, 'user_id', 'id');
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(UserSubscription::class, 'user_id', 'id');
    }

    public function professionalProfile(): HasOne
    {
        return $this->hasOne(ProfessionalProfile::class, 'user_id', 'id');
    }
}
