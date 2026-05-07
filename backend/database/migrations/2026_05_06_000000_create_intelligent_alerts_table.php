<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('intelligent_alerts', function (Blueprint $table): void {
            $table->id();
            $table->uuid('user_id')->nullable()->index();
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->string('address')->nullable();
            
            // Análisis de riesgo
            $table->enum('risk_level', ['low', 'medium', 'high', 'severe'])->default('low');
            $table->longText('analysis_reason')->nullable(); // Por qué Groq detectó riesgo
            $table->json('recommended_actions')->nullable(); // Acciones sugeridas
            
            // Contexto del usuario para personalizacion
            $table->json('user_context')->nullable(); // hora, actividades, patrones
            
            // Datos climáticos que generaron alerta
            $table->decimal('temperature', 5, 2)->nullable();
            $table->unsignedSmallInteger('weather_code')->nullable();
            $table->decimal('wind_speed', 5, 2)->nullable();
            $table->json('historical_pattern')->nullable(); // Patrón detectado en histórico
            
            // Control
            $table->boolean('is_notified')->default(false);
            $table->timestamp('notified_at')->nullable();
            $table->boolean('is_read')->default(false);
            $table->timestamp('read_at')->nullable();
            
            // Feedback del usuario
            $table->string('user_feedback')->nullable(); // 'accurate', 'false_positive', null
            
            $table->timestamps();
            
            $table->index(['user_id', 'created_at']);
            $table->index(['risk_level']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('intelligent_alerts');
    }
};
