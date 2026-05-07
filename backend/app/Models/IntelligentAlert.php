<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class IntelligentAlert extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'latitude',
        'longitude',
        'address',
        'risk_level',
        'analysis_reason',
        'recommended_actions',
        'user_context',
        'temperature',
        'weather_code',
        'wind_speed',
        'historical_pattern',
        'is_notified',
        'notified_at',
        'is_read',
        'read_at',
        'user_feedback',
    ];

    protected function casts(): array
    {
        return [
            'latitude' => 'float',
            'longitude' => 'float',
            'temperature' => 'float',
            'wind_speed' => 'float',
            'recommended_actions' => 'array',
            'user_context' => 'array',
            'historical_pattern' => 'array',
            'is_notified' => 'boolean',
            'notified_at' => 'datetime',
            'is_read' => 'boolean',
            'read_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Obtener alertas no leídas del usuario
     */
    public function scopeUnread($query)
    {
        return $query->where('is_read', false);
    }

    /**
     * Obtener alertas de alto riesgo
     */
    public function scopeHighRisk($query)
    {
        return $query->whereIn('risk_level', ['high', 'severe']);
    }

    /**
     * Obtener alertas recientes (últimas 48h)
     */
    public function scopeRecent($query)
    {
        return $query->where('created_at', '>=', now()->subHours(48));
    }
}
