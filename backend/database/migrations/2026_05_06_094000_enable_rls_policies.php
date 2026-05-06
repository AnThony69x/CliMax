<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Enable RLS on application tables.
        DB::statement('ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE public.intelligent_alerts ENABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE public.weather_logs ENABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE public.weather_alert_reports ENABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY');

        // Reset policies idempotently.
        DB::statement('DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles');
        DB::statement('DROP POLICY IF EXISTS profiles_insert_own ON public.profiles');
        DB::statement('DROP POLICY IF EXISTS profiles_update_own ON public.profiles');

        DB::statement('DROP POLICY IF EXISTS intelligent_alerts_select_own ON public.intelligent_alerts');
        DB::statement('DROP POLICY IF EXISTS intelligent_alerts_insert_own ON public.intelligent_alerts');
        DB::statement('DROP POLICY IF EXISTS intelligent_alerts_update_own ON public.intelligent_alerts');
        DB::statement('DROP POLICY IF EXISTS intelligent_alerts_delete_own ON public.intelligent_alerts');

        DB::statement('DROP POLICY IF EXISTS weather_logs_select_own ON public.weather_logs');
        DB::statement('DROP POLICY IF EXISTS weather_logs_insert_own ON public.weather_logs');
        DB::statement('DROP POLICY IF EXISTS weather_logs_update_own ON public.weather_logs');
        DB::statement('DROP POLICY IF EXISTS weather_logs_delete_own ON public.weather_logs');

        DB::statement('DROP POLICY IF EXISTS weather_alert_reports_select_own ON public.weather_alert_reports');
        DB::statement('DROP POLICY IF EXISTS weather_alert_reports_insert_own ON public.weather_alert_reports');
        DB::statement('DROP POLICY IF EXISTS weather_alert_reports_update_own ON public.weather_alert_reports');
        DB::statement('DROP POLICY IF EXISTS weather_alert_reports_delete_own ON public.weather_alert_reports');

        DB::statement('DROP POLICY IF EXISTS community_posts_select_authenticated ON public.community_posts');
        DB::statement('DROP POLICY IF EXISTS community_posts_insert_own ON public.community_posts');
        DB::statement('DROP POLICY IF EXISTS community_posts_update_own ON public.community_posts');
        DB::statement('DROP POLICY IF EXISTS community_posts_delete_own ON public.community_posts');

        DB::statement('DROP POLICY IF EXISTS community_comments_select_authenticated ON public.community_comments');
        DB::statement('DROP POLICY IF EXISTS community_comments_insert_own ON public.community_comments');
        DB::statement('DROP POLICY IF EXISTS community_comments_update_own ON public.community_comments');
        DB::statement('DROP POLICY IF EXISTS community_comments_delete_own ON public.community_comments');

        // Profiles: authenticated users can read display data; only owner can write own profile.
        DB::statement(<<<'SQL'
            CREATE POLICY profiles_select_authenticated
            ON public.profiles
            FOR SELECT
            TO authenticated
            USING (true)
        SQL);
        DB::statement(<<<'SQL'
            CREATE POLICY profiles_insert_own
            ON public.profiles
            FOR INSERT
            TO authenticated
            WITH CHECK (id = auth.uid())
        SQL);
        DB::statement(<<<'SQL'
            CREATE POLICY profiles_update_own
            ON public.profiles
            FOR UPDATE
            TO authenticated
            USING (id = auth.uid())
            WITH CHECK (id = auth.uid())
        SQL);

        // Intelligent alerts: private per user.
        DB::statement(<<<'SQL'
            CREATE POLICY intelligent_alerts_select_own
            ON public.intelligent_alerts
            FOR SELECT
            TO authenticated
            USING (user_id = auth.uid())
        SQL);
        DB::statement(<<<'SQL'
            CREATE POLICY intelligent_alerts_insert_own
            ON public.intelligent_alerts
            FOR INSERT
            TO authenticated
            WITH CHECK (user_id = auth.uid())
        SQL);
        DB::statement(<<<'SQL'
            CREATE POLICY intelligent_alerts_update_own
            ON public.intelligent_alerts
            FOR UPDATE
            TO authenticated
            USING (user_id = auth.uid())
            WITH CHECK (user_id = auth.uid())
        SQL);
        DB::statement(<<<'SQL'
            CREATE POLICY intelligent_alerts_delete_own
            ON public.intelligent_alerts
            FOR DELETE
            TO authenticated
            USING (user_id = auth.uid())
        SQL);

        // Weather logs: private per user.
        DB::statement(<<<'SQL'
            CREATE POLICY weather_logs_select_own
            ON public.weather_logs
            FOR SELECT
            TO authenticated
            USING (user_id = auth.uid())
        SQL);
        DB::statement(<<<'SQL'
            CREATE POLICY weather_logs_insert_own
            ON public.weather_logs
            FOR INSERT
            TO authenticated
            WITH CHECK (user_id = auth.uid())
        SQL);
        DB::statement(<<<'SQL'
            CREATE POLICY weather_logs_update_own
            ON public.weather_logs
            FOR UPDATE
            TO authenticated
            USING (user_id = auth.uid())
            WITH CHECK (user_id = auth.uid())
        SQL);
        DB::statement(<<<'SQL'
            CREATE POLICY weather_logs_delete_own
            ON public.weather_logs
            FOR DELETE
            TO authenticated
            USING (user_id = auth.uid())
        SQL);

        // User-submitted alert evidences: private per user.
        DB::statement(<<<'SQL'
            CREATE POLICY weather_alert_reports_select_own
            ON public.weather_alert_reports
            FOR SELECT
            TO authenticated
            USING (user_id = auth.uid())
        SQL);
        DB::statement(<<<'SQL'
            CREATE POLICY weather_alert_reports_insert_own
            ON public.weather_alert_reports
            FOR INSERT
            TO authenticated
            WITH CHECK (user_id = auth.uid())
        SQL);
        DB::statement(<<<'SQL'
            CREATE POLICY weather_alert_reports_update_own
            ON public.weather_alert_reports
            FOR UPDATE
            TO authenticated
            USING (user_id = auth.uid())
            WITH CHECK (user_id = auth.uid())
        SQL);
        DB::statement(<<<'SQL'
            CREATE POLICY weather_alert_reports_delete_own
            ON public.weather_alert_reports
            FOR DELETE
            TO authenticated
            USING (user_id = auth.uid())
        SQL);

        // Community feed: authenticated users can read all posts/comments, but only manage their own rows.
        DB::statement(<<<'SQL'
            CREATE POLICY community_posts_select_authenticated
            ON public.community_posts
            FOR SELECT
            TO authenticated
            USING (true)
        SQL);
        DB::statement(<<<'SQL'
            CREATE POLICY community_posts_insert_own
            ON public.community_posts
            FOR INSERT
            TO authenticated
            WITH CHECK (user_id = auth.uid())
        SQL);
        DB::statement(<<<'SQL'
            CREATE POLICY community_posts_update_own
            ON public.community_posts
            FOR UPDATE
            TO authenticated
            USING (user_id = auth.uid())
            WITH CHECK (user_id = auth.uid())
        SQL);
        DB::statement(<<<'SQL'
            CREATE POLICY community_posts_delete_own
            ON public.community_posts
            FOR DELETE
            TO authenticated
            USING (user_id = auth.uid())
        SQL);

        DB::statement(<<<'SQL'
            CREATE POLICY community_comments_select_authenticated
            ON public.community_comments
            FOR SELECT
            TO authenticated
            USING (true)
        SQL);
        DB::statement(<<<'SQL'
            CREATE POLICY community_comments_insert_own
            ON public.community_comments
            FOR INSERT
            TO authenticated
            WITH CHECK (user_id = auth.uid())
        SQL);
        DB::statement(<<<'SQL'
            CREATE POLICY community_comments_update_own
            ON public.community_comments
            FOR UPDATE
            TO authenticated
            USING (user_id = auth.uid())
            WITH CHECK (user_id = auth.uid())
        SQL);
        DB::statement(<<<'SQL'
            CREATE POLICY community_comments_delete_own
            ON public.community_comments
            FOR DELETE
            TO authenticated
            USING (user_id = auth.uid())
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP POLICY IF EXISTS community_comments_delete_own ON public.community_comments');
        DB::statement('DROP POLICY IF EXISTS community_comments_update_own ON public.community_comments');
        DB::statement('DROP POLICY IF EXISTS community_comments_insert_own ON public.community_comments');
        DB::statement('DROP POLICY IF EXISTS community_comments_select_authenticated ON public.community_comments');

        DB::statement('DROP POLICY IF EXISTS community_posts_delete_own ON public.community_posts');
        DB::statement('DROP POLICY IF EXISTS community_posts_update_own ON public.community_posts');
        DB::statement('DROP POLICY IF EXISTS community_posts_insert_own ON public.community_posts');
        DB::statement('DROP POLICY IF EXISTS community_posts_select_authenticated ON public.community_posts');

        DB::statement('DROP POLICY IF EXISTS weather_alert_reports_delete_own ON public.weather_alert_reports');
        DB::statement('DROP POLICY IF EXISTS weather_alert_reports_update_own ON public.weather_alert_reports');
        DB::statement('DROP POLICY IF EXISTS weather_alert_reports_insert_own ON public.weather_alert_reports');
        DB::statement('DROP POLICY IF EXISTS weather_alert_reports_select_own ON public.weather_alert_reports');

        DB::statement('DROP POLICY IF EXISTS weather_logs_delete_own ON public.weather_logs');
        DB::statement('DROP POLICY IF EXISTS weather_logs_update_own ON public.weather_logs');
        DB::statement('DROP POLICY IF EXISTS weather_logs_insert_own ON public.weather_logs');
        DB::statement('DROP POLICY IF EXISTS weather_logs_select_own ON public.weather_logs');

        DB::statement('DROP POLICY IF EXISTS intelligent_alerts_delete_own ON public.intelligent_alerts');
        DB::statement('DROP POLICY IF EXISTS intelligent_alerts_update_own ON public.intelligent_alerts');
        DB::statement('DROP POLICY IF EXISTS intelligent_alerts_insert_own ON public.intelligent_alerts');
        DB::statement('DROP POLICY IF EXISTS intelligent_alerts_select_own ON public.intelligent_alerts');

        DB::statement('DROP POLICY IF EXISTS profiles_update_own ON public.profiles');
        DB::statement('DROP POLICY IF EXISTS profiles_insert_own ON public.profiles');
        DB::statement('DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles');

        DB::statement('ALTER TABLE public.community_comments DISABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE public.community_posts DISABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE public.weather_alert_reports DISABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE public.weather_logs DISABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE public.intelligent_alerts DISABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY');
    }
};
