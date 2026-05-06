<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public $withinTransaction = false;

    public function up(): void
    {
        // Clean invalid graph edges before enforcing relational constraints.
        DB::statement(<<<'SQL'
            DELETE FROM public.community_comments cc
            WHERE NOT EXISTS (
                SELECT 1 FROM public.community_posts cp WHERE cp.id = cc.post_id
            )
        SQL);

        DB::statement(<<<'SQL'
            UPDATE public.community_comments cc
            SET parent_comment_id = NULL
            WHERE parent_comment_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM public.community_comments parent
                  WHERE parent.id = cc.parent_comment_id
              )
        SQL);

        // Enforce comment -> post and reply -> parent integrity.
        DB::statement(<<<'SQL'
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'community_comments_post_fk'
                ) THEN
                    ALTER TABLE public.community_comments
                    ADD CONSTRAINT community_comments_post_fk
                    FOREIGN KEY (post_id) REFERENCES public.community_posts(id) ON DELETE CASCADE;
                END IF;
            END
            $$;
        SQL);

        DB::statement(<<<'SQL'
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'community_comments_parent_fk'
                ) THEN
                    ALTER TABLE public.community_comments
                    ADD CONSTRAINT community_comments_parent_fk
                    FOREIGN KEY (parent_comment_id) REFERENCES public.community_comments(id) ON DELETE SET NULL;
                END IF;
            END
            $$;
        SQL);

        // Best-effort user FKs (can be restricted on Supabase auth schema).
        DB::statement(<<<'SQL'
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'community_posts_user_auth_users_fk'
                ) THEN
                    ALTER TABLE public.community_posts
                    ADD CONSTRAINT community_posts_user_auth_users_fk
                    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
                END IF;
            EXCEPTION
                WHEN insufficient_privilege THEN
                    RAISE NOTICE 'Skipping community_posts_user_auth_users_fk: insufficient privilege on auth.users.';
                WHEN undefined_table THEN
                    RAISE NOTICE 'Skipping community_posts_user_auth_users_fk: auth.users is not accessible.';
            END
            $$;
        SQL);

        DB::statement(<<<'SQL'
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'community_comments_user_auth_users_fk'
                ) THEN
                    ALTER TABLE public.community_comments
                    ADD CONSTRAINT community_comments_user_auth_users_fk
                    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
                END IF;
            EXCEPTION
                WHEN insufficient_privilege THEN
                    RAISE NOTICE 'Skipping community_comments_user_auth_users_fk: insufficient privilege on auth.users.';
                WHEN undefined_table THEN
                    RAISE NOTICE 'Skipping community_comments_user_auth_users_fk: auth.users is not accessible.';
            END
            $$;
        SQL);

        DB::statement(<<<'SQL'
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'weather_alert_reports_user_auth_users_fk'
                ) THEN
                    ALTER TABLE public.weather_alert_reports
                    ADD CONSTRAINT weather_alert_reports_user_auth_users_fk
                    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
                END IF;
            EXCEPTION
                WHEN insufficient_privilege THEN
                    RAISE NOTICE 'Skipping weather_alert_reports_user_auth_users_fk: insufficient privilege on auth.users.';
                WHEN undefined_table THEN
                    RAISE NOTICE 'Skipping weather_alert_reports_user_auth_users_fk: auth.users is not accessible.';
            END
            $$;
        SQL);
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE public.weather_alert_reports DROP CONSTRAINT IF EXISTS weather_alert_reports_user_auth_users_fk');
        DB::statement('ALTER TABLE public.community_comments DROP CONSTRAINT IF EXISTS community_comments_user_auth_users_fk');
        DB::statement('ALTER TABLE public.community_posts DROP CONSTRAINT IF EXISTS community_posts_user_auth_users_fk');
        DB::statement('ALTER TABLE public.community_comments DROP CONSTRAINT IF EXISTS community_comments_parent_fk');
        DB::statement('ALTER TABLE public.community_comments DROP CONSTRAINT IF EXISTS community_comments_post_fk');
    }
};
