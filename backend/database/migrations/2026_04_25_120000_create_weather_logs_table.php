<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('weather_logs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->index();
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->text('address')->nullable();
            $table->decimal('temperature', 5, 2)->nullable();
            $table->unsignedSmallInteger('weather_code')->nullable();
            $table->decimal('wind_speed', 5, 2)->nullable();
            $table->timestamp('captured_at')->nullable();
            $table->boolean('is_guest')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('weather_logs');
    }
};
