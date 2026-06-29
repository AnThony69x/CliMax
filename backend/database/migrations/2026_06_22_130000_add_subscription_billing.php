<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscription_plans', function (Blueprint $table): void {
            if (! Schema::hasColumn('subscription_plans', 'currency')) {
                $table->string('currency', 3)->default('usd');
            }
            if (! Schema::hasColumn('subscription_plans', 'monthly_price_cents')) {
                $table->unsignedInteger('monthly_price_cents')->default(0);
            }
            if (! Schema::hasColumn('subscription_plans', 'yearly_price_cents')) {
                $table->unsignedInteger('yearly_price_cents')->default(0);
            }
            if (! Schema::hasColumn('subscription_plans', 'stripe_monthly_price_id')) {
                $table->string('stripe_monthly_price_id', 120)->nullable();
            }
            if (! Schema::hasColumn('subscription_plans', 'stripe_yearly_price_id')) {
                $table->string('stripe_yearly_price_id', 120)->nullable();
            }
        });

        DB::table('subscription_plans')->where('key', 'free')->update([
            'monthly_price_cents' => 0,
            'yearly_price_cents' => 0,
            'currency' => 'usd',
        ]);
        DB::table('subscription_plans')->where('key', 'premium')->update([
            'monthly_price_cents' => 499,
            'yearly_price_cents' => 4990,
            'currency' => 'usd',
        ]);
        DB::table('subscription_plans')->where('key', 'professional')->update([
            'monthly_price_cents' => 1299,
            'yearly_price_cents' => 12990,
            'currency' => 'usd',
        ]);

        Schema::table('user_subscriptions', function (Blueprint $table): void {
            if (! Schema::hasColumn('user_subscriptions', 'billing_interval')) {
                $table->string('billing_interval', 12)->nullable()->index();
            }
            if (! Schema::hasColumn('user_subscriptions', 'payment_provider')) {
                $table->string('payment_provider', 40)->nullable()->index();
            }
            if (! Schema::hasColumn('user_subscriptions', 'provider_customer_id')) {
                $table->string('provider_customer_id', 160)->nullable();
            }
            if (! Schema::hasColumn('user_subscriptions', 'provider_subscription_id')) {
                $table->string('provider_subscription_id', 160)->nullable()->index();
            }
            if (! Schema::hasColumn('user_subscriptions', 'provider_checkout_session_id')) {
                $table->string('provider_checkout_session_id', 160)->nullable()->index();
            }
        });

        Schema::create('subscription_checkout_sessions', function (Blueprint $table): void {
            $table->id();
            $table->uuid('user_id')->index();
            $table->foreignId('subscription_plan_id')->constrained('subscription_plans')->cascadeOnDelete();
            $table->string('billing_interval', 12);
            $table->unsignedInteger('amount_cents')->default(0);
            $table->string('currency', 3)->default('usd');
            $table->string('payment_provider', 40)->default('simulated')->index();
            $table->string('provider_session_id', 160)->nullable()->index();
            $table->text('checkout_url')->nullable();
            $table->string('status', 24)->default('open')->index();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });

        DB::statement('ALTER TABLE public.subscription_checkout_sessions ENABLE ROW LEVEL SECURITY');
        DB::statement('REVOKE ALL ON public.subscription_checkout_sessions FROM anon, authenticated');
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_checkout_sessions');

        Schema::table('user_subscriptions', function (Blueprint $table): void {
            $table->dropColumn([
                'billing_interval',
                'payment_provider',
                'provider_customer_id',
                'provider_subscription_id',
                'provider_checkout_session_id',
            ]);
        });

        Schema::table('subscription_plans', function (Blueprint $table): void {
            $table->dropColumn([
                'currency',
                'monthly_price_cents',
                'yearly_price_cents',
                'stripe_monthly_price_id',
                'stripe_yearly_price_id',
            ]);
        });
    }
};
