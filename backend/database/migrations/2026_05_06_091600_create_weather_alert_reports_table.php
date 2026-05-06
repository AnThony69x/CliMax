<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('weather_alert_reports', function (Blueprint $table): void {
            $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
            $table->uuid('user_id')->index();
            $table->string('title', 180);
            $table->text('description');
            $table->string('severity', 20)->default('warning');
            $table->boolean('is_read')->default(false);
            $table->string('image_url')->nullable();
            $table->string('image_path')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'created_at']);
            $table->index(['user_id', 'is_read']);
        });

        DB::statement(<<<'SQL'
            ALTER TABLE public.weather_alert_reports
            ADD CONSTRAINT weather_alert_reports_severity_ck
            CHECK (severity IN ('low', 'warning', 'high', 'critical'))
        SQL);
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE public.weather_alert_reports DROP CONSTRAINT IF EXISTS weather_alert_reports_severity_ck');
        Schema::dropIfExists('weather_alert_reports');
    }
};
