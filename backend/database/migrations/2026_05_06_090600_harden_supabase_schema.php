<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public $withinTransaction = false;

    public function up(): void
    {
        // Ensure profile timestamps are populated and defaulted.
        DB::statement("UPDATE public.profiles SET created_at = NOW() WHERE created_at IS NULL");
        DB::statement("UPDATE public.profiles SET updated_at = NOW() WHERE updated_at IS NULL");
        DB::statement("ALTER TABLE public.profiles ALTER COLUMN created_at SET DEFAULT NOW()");
        DB::statement("ALTER TABLE public.profiles ALTER COLUMN updated_at SET DEFAULT NOW()");
        DB::statement("ALTER TABLE public.profiles ALTER COLUMN created_at SET NOT NULL");
        DB::statement("ALTER TABLE public.profiles ALTER COLUMN updated_at SET NOT NULL");

        // Link profile identity to Supabase auth users.
        DB::statement(<<<'SQL'
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'profiles_id_auth_users_fk'
                ) THEN
                    ALTER TABLE public.profiles
                    ADD CONSTRAINT profiles_id_auth_users_fk
                    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
                END IF;
            EXCEPTION
                WHEN insufficient_privilege THEN
                    RAISE NOTICE 'Skipping profiles_id_auth_users_fk: insufficient privilege on auth.users.';
                WHEN undefined_table THEN
                    RAISE NOTICE 'Skipping profiles_id_auth_users_fk: auth.users table not accessible.';
            END
            $$;
        SQL);

        // Convert JSON payloads to JSONB for better indexing and operators.
        DB::statement("ALTER TABLE public.intelligent_alerts ALTER COLUMN recommended_actions TYPE jsonb USING recommended_actions::jsonb");
        DB::statement("ALTER TABLE public.intelligent_alerts ALTER COLUMN user_context TYPE jsonb USING user_context::jsonb");
        DB::statement("ALTER TABLE public.intelligent_alerts ALTER COLUMN historical_pattern TYPE jsonb USING historical_pattern::jsonb");

        // Harden coordinates and keep quality constraints explicit.
        DB::statement(<<<'SQL'
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'intelligent_alerts_latitude_range_ck'
                ) THEN
                    ALTER TABLE public.intelligent_alerts
                    ADD CONSTRAINT intelligent_alerts_latitude_range_ck
                    CHECK (latitude >= -90 AND latitude <= 90) NOT VALID;
                END IF;
            END
            $$;
        SQL);
        DB::statement(<<<'SQL'
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'intelligent_alerts_longitude_range_ck'
                ) THEN
                    ALTER TABLE public.intelligent_alerts
                    ADD CONSTRAINT intelligent_alerts_longitude_range_ck
                    CHECK (longitude >= -180 AND longitude <= 180) NOT VALID;
                END IF;
            END
            $$;
        SQL);
        DB::statement(<<<'SQL'
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'weather_logs_latitude_range_ck'
                ) THEN
                    ALTER TABLE public.weather_logs
                    ADD CONSTRAINT weather_logs_latitude_range_ck
                    CHECK (latitude >= -90 AND latitude <= 90) NOT VALID;
                END IF;
            END
            $$;
        SQL);
        DB::statement(<<<'SQL'
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'weather_logs_longitude_range_ck'
                ) THEN
                    ALTER TABLE public.weather_logs
                    ADD CONSTRAINT weather_logs_longitude_range_ck
                    CHECK (longitude >= -180 AND longitude <= 180) NOT VALID;
                END IF;
            END
            $$;
        SQL);

        // Clean orphan references before adding foreign keys.
        DB::statement(<<<'SQL'
            UPDATE public.intelligent_alerts ia
            SET user_id = NULL
            WHERE user_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = ia.user_id)
        SQL);
        DB::statement(<<<'SQL'
            UPDATE public.weather_logs wl
            SET user_id = NULL
            WHERE user_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = wl.user_id)
        SQL);

        // Link domain tables to Supabase auth users.
        DB::statement(<<<'SQL'
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'intelligent_alerts_user_id_auth_users_fk'
                ) THEN
                    ALTER TABLE public.intelligent_alerts
                    ADD CONSTRAINT intelligent_alerts_user_id_auth_users_fk
                    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL NOT VALID;
                END IF;
            EXCEPTION
                WHEN insufficient_privilege THEN
                    RAISE NOTICE 'Skipping intelligent_alerts_user_id_auth_users_fk: insufficient privilege on auth.users.';
                WHEN undefined_table THEN
                    RAISE NOTICE 'Skipping intelligent_alerts_user_id_auth_users_fk: auth.users table not accessible.';
            END
            $$;
        SQL);
        DB::statement(<<<'SQL'
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'weather_logs_user_id_auth_users_fk'
                ) THEN
                    ALTER TABLE public.weather_logs
                    ADD CONSTRAINT weather_logs_user_id_auth_users_fk
                    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL NOT VALID;
                END IF;
            EXCEPTION
                WHEN insufficient_privilege THEN
                    RAISE NOTICE 'Skipping weather_logs_user_id_auth_users_fk: insufficient privilege on auth.users.';
                WHEN undefined_table THEN
                    RAISE NOTICE 'Skipping weather_logs_user_id_auth_users_fk: auth.users table not accessible.';
            END
            $$;
        SQL);

        // Query-path indexes for user timelines and unread alerts.
        DB::statement("CREATE INDEX IF NOT EXISTS intelligent_alerts_user_created_idx ON public.intelligent_alerts (user_id, created_at DESC)");
        DB::statement("CREATE INDEX IF NOT EXISTS intelligent_alerts_user_unread_idx ON public.intelligent_alerts (user_id) WHERE is_read = false");
        DB::statement("CREATE INDEX IF NOT EXISTS weather_logs_user_captured_idx ON public.weather_logs (user_id, captured_at DESC)");
    }

    public function down(): void
    {
        DB::statement("DROP INDEX IF EXISTS public.weather_logs_user_captured_idx");
        DB::statement("DROP INDEX IF EXISTS public.intelligent_alerts_user_unread_idx");
        DB::statement("DROP INDEX IF EXISTS public.intelligent_alerts_user_created_idx");

        DB::statement("ALTER TABLE public.weather_logs DROP CONSTRAINT IF EXISTS weather_logs_user_id_auth_users_fk");
        DB::statement("ALTER TABLE public.intelligent_alerts DROP CONSTRAINT IF EXISTS intelligent_alerts_user_id_auth_users_fk");

        DB::statement("ALTER TABLE public.weather_logs DROP CONSTRAINT IF EXISTS weather_logs_longitude_range_ck");
        DB::statement("ALTER TABLE public.weather_logs DROP CONSTRAINT IF EXISTS weather_logs_latitude_range_ck");
        DB::statement("ALTER TABLE public.intelligent_alerts DROP CONSTRAINT IF EXISTS intelligent_alerts_longitude_range_ck");
        DB::statement("ALTER TABLE public.intelligent_alerts DROP CONSTRAINT IF EXISTS intelligent_alerts_latitude_range_ck");

        DB::statement("ALTER TABLE public.intelligent_alerts ALTER COLUMN historical_pattern TYPE json USING historical_pattern::json");
        DB::statement("ALTER TABLE public.intelligent_alerts ALTER COLUMN user_context TYPE json USING user_context::json");
        DB::statement("ALTER TABLE public.intelligent_alerts ALTER COLUMN recommended_actions TYPE json USING recommended_actions::json");

        DB::statement("ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_auth_users_fk");
        DB::statement("ALTER TABLE public.profiles ALTER COLUMN created_at DROP NOT NULL");
        DB::statement("ALTER TABLE public.profiles ALTER COLUMN updated_at DROP NOT NULL");
        DB::statement("ALTER TABLE public.profiles ALTER COLUMN created_at DROP DEFAULT");
        DB::statement("ALTER TABLE public.profiles ALTER COLUMN updated_at DROP DEFAULT");
    }
};
