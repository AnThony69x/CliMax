<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('push_notifications_log', function (Blueprint $table): void {
            $table->id();
            $table->uuid('user_id')->index();
            $table->enum('kind', ['intelligent_alert', 'weather_change', 'manual']);
            $table->unsignedBigInteger('alert_id')->nullable();
            $table->string('change_type', 100)->nullable();
            $table->string('title');
            $table->text('body');
            $table->json('data')->nullable();
            $table->unsignedInteger('tokens_count')->default(0);
            $table->json('ticket_ids')->nullable();
            $table->json('recipient_tokens')->nullable();
            $table->enum('status', ['queued', 'sent', 'failed', 'partial']);
            $table->text('error_message')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('receipts_checked_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'sent_at']);
            $table->index('kind');
        });

        // FK a auth.users tolerante a permisos
        DB::statement(<<<'SQL'
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'push_notifications_log_user_id_auth_users_fk'
                ) THEN
                    ALTER TABLE public.push_notifications_log
                    ADD CONSTRAINT push_notifications_log_user_id_auth_users_fk
                    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
                END IF;
            EXCEPTION
                WHEN insufficient_privilege THEN
                    RAISE NOTICE 'Skipping push_notifications_log_user_id_auth_users_fk: insufficient privilege on auth.users.';
                WHEN undefined_table THEN
                    RAISE NOTICE 'Skipping push_notifications_log_user_id_auth_users_fk: auth.users not accessible.';
            END;
            $$;
        SQL);

        // RLS habilitada con solo SELECT_own (los inserts los hace el backend con service_role)
        DB::statement('ALTER TABLE public.push_notifications_log ENABLE ROW LEVEL SECURITY');

        DB::statement('DROP POLICY IF EXISTS push_notifications_log_select_own ON public.push_notifications_log');

        DB::statement(<<<'SQL'
            CREATE POLICY push_notifications_log_select_own
            ON public.push_notifications_log
            FOR SELECT
            TO authenticated
            USING (user_id = auth.uid())
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP POLICY IF EXISTS push_notifications_log_select_own ON public.push_notifications_log');

        DB::statement('ALTER TABLE public.push_notifications_log DROP CONSTRAINT IF EXISTS push_notifications_log_user_id_auth_users_fk');

        Schema::dropIfExists('push_notifications_log');
    }
};
