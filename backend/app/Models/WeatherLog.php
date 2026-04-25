<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WeatherLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'latitude',
        'longitude',
        'address',
        'temperature',
        'weather_code',
        'wind_speed',
        'captured_at',
        'is_guest',
    ];

    protected function casts(): array
    {
        return [
            'latitude' => 'float',
            'longitude' => 'float',
            'temperature' => 'float',
            'wind_speed' => 'float',
            'captured_at' => 'datetime',
            'is_guest' => 'boolean',
        ];
    }
}
