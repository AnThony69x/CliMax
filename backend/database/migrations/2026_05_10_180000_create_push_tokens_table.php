<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('push_tokens', function (Blueprint $table): void {
            $table->id();
            $table->uuid('user_id')->nullable()->index();
            $table->string('token')->unique();
            $table->enum('platform', ['ios', 'android', 'web'])->default('android');
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'platform']);
        });

        // FK a auth.users (Supabase) tolerante a permisos
        DB::statement(<<<'SQL'
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'push_tokens_user_id_auth_users_fk'
                ) THEN
                    ALTER TABLE public.push_tokens
                    ADD CONSTRAINT push_tokens_user_id_auth_users_fk
                    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
                END IF;
            EXCEPTION
                WHEN insufficient_privilege THEN
                    RAISE NOTICE 'Skipping push_tokens_user_id_auth_users_fk: insufficient privilege on auth.users.';
                WHEN undefined_table THEN
                    RAISE NOTICE 'Skipping push_tokens_user_id_auth_users_fk: auth.users not accessible.';
            END;
            $$;
        SQL);

        // RLS + policies
        DB::statement('ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY');

        DB::statement('DROP POLICY IF EXISTS push_tokens_select_own ON public.push_tokens');
        DB::statement('DROP POLICY IF EXISTS push_tokens_insert_own ON public.push_tokens');
        DB::statement('DROP POLICY IF EXISTS push_tokens_update_own ON public.push_tokens');
        DB::statement('DROP POLICY IF EXISTS push_tokens_delete_own ON public.push_tokens');

        DB::statement(<<<'SQL'
            CREATE POLICY push_tokens_select_own
            ON public.push_tokens
            FOR SELECT
            TO authenticated
            USING (user_id = auth.uid())
        SQL);

        DB::statement(<<<'SQL'
            CREATE POLICY push_tokens_insert_own
            ON public.push_tokens
            FOR INSERT
            TO authenticated
            WITH CHECK (user_id = auth.uid())
        SQL);

        DB::statement(<<<'SQL'
            CREATE POLICY push_tokens_update_own
            ON public.push_tokens
            FOR UPDATE
            TO authenticated
            USING (user_id = auth.uid())
            WITH CHECK (user_id = auth.uid())
        SQL);

        DB::statement(<<<'SQL'
            CREATE POLICY push_tokens_delete_own
            ON public.push_tokens
            FOR DELETE
            TO authenticated
            USING (user_id = auth.uid())
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP POLICY IF EXISTS push_tokens_delete_own ON public.push_tokens');
        DB::statement('DROP POLICY IF EXISTS push_tokens_update_own ON public.push_tokens');
        DB::statement('DROP POLICY IF EXISTS push_tokens_insert_own ON public.push_tokens');
        DB::statement('DROP POLICY IF EXISTS push_tokens_select_own ON public.push_tokens');

        DB::statement('ALTER TABLE public.push_tokens DROP CONSTRAINT IF EXISTS push_tokens_user_id_auth_users_fk');

        Schema::dropIfExists('push_tokens');
    }
};
