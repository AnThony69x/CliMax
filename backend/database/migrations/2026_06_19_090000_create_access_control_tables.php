<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff_roles', function (Blueprint $table): void {
            $table->id();
            $table->uuid('user_id')->unique();
            $table->string('role', 24);
            $table->uuid('assigned_by')->nullable();
            $table->timestamp('assigned_at')->useCurrent();
            $table->timestamps();

            $table->index('role');
        });

        Schema::create('subscription_plans', function (Blueprint $table): void {
            $table->id();
            $table->string('key', 40)->unique();
            $table->string('name', 100);
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('user_subscriptions', function (Blueprint $table): void {
            $table->id();
            $table->uuid('user_id')->index();
            $table->foreignId('subscription_plan_id')->constrained('subscription_plans')->cascadeOnDelete();
            $table->string('status', 24)->default('active')->index();
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->uuid('assigned_by')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status']);
        });

        Schema::create('professional_profiles', function (Blueprint $table): void {
            $table->id();
            $table->uuid('user_id')->unique();
            $table->string('sector', 60);
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index('sector');
        });

        Schema::create('feature_entitlements', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('subscription_plan_id')->nullable()->constrained('subscription_plans')->cascadeOnDelete();
            $table->string('professional_sector', 60)->nullable();
            $table->string('feature_key', 100);
            $table->boolean('enabled')->default(true);
            $table->timestamps();

            $table->unique(['subscription_plan_id', 'professional_sector', 'feature_key'], 'feature_entitlements_scope_unique');
        });

        Schema::create('access_audit_logs', function (Blueprint $table): void {
            $table->id();
            $table->uuid('actor_user_id')->nullable()->index();
            $table->uuid('target_user_id')->nullable()->index();
            $table->string('action', 80)->index();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });

        DB::table('subscription_plans')->insert([
            [
                'key' => 'free',
                'name' => 'Free',
                'description' => 'Clima actual, comunidad basica y alertas basicas.',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'key' => 'premium',
                'name' => 'Premium',
                'description' => 'Alertas ampliadas, comparativas y detalle climatico avanzado.',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'key' => 'professional',
                'name' => 'Professional',
                'description' => 'Trazabilidad climatica por sector, historico extendido y exportaciones.',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $plans = DB::table('subscription_plans')->pluck('id', 'key');
        if ($plans->isEmpty()) {
            return;
        }

        $entitlements = [
            'free' => [
                'weather.current',
                'community.basic',
                'alerts.basic',
                'weather.history.short',
            ],
            'premium' => [
                'weather.current',
                'community.basic',
                'alerts.basic',
                'alerts.advanced',
                'weather.comparisons',
                'weather.history.short',
            ],
            'professional' => [
                'weather.current',
                'community.basic',
                'alerts.basic',
                'alerts.advanced',
                'weather.comparisons',
                'weather.history.short',
                'weather.history.extended',
                'weather.history.export',
                'professional.dashboard',
            ],
        ];

        foreach ($entitlements as $planKey => $features) {
            foreach ($features as $feature) {
                DB::table('feature_entitlements')->insert([
                    'subscription_plan_id' => $plans[$planKey],
                    'feature_key' => $feature,
                    'enabled' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('access_audit_logs');
        Schema::dropIfExists('feature_entitlements');
        Schema::dropIfExists('professional_profiles');
        Schema::dropIfExists('user_subscriptions');
        Schema::dropIfExists('subscription_plans');
        Schema::dropIfExists('staff_roles');
    }
};
