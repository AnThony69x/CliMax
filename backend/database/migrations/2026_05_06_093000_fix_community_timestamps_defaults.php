<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Backfill legacy rows that were inserted without timestamps.
        DB::statement("UPDATE public.community_posts SET created_at = NOW() WHERE created_at IS NULL");
        DB::statement("UPDATE public.community_posts SET updated_at = NOW() WHERE updated_at IS NULL");
        DB::statement("UPDATE public.community_comments SET created_at = NOW() WHERE created_at IS NULL");
        DB::statement("UPDATE public.community_comments SET updated_at = NOW() WHERE updated_at IS NULL");

        // Ensure future inserts always get server-side timestamps.
        DB::statement("ALTER TABLE public.community_posts ALTER COLUMN created_at SET DEFAULT NOW()");
        DB::statement("ALTER TABLE public.community_posts ALTER COLUMN updated_at SET DEFAULT NOW()");
        DB::statement("ALTER TABLE public.community_posts ALTER COLUMN created_at SET NOT NULL");
        DB::statement("ALTER TABLE public.community_posts ALTER COLUMN updated_at SET NOT NULL");

        DB::statement("ALTER TABLE public.community_comments ALTER COLUMN created_at SET DEFAULT NOW()");
        DB::statement("ALTER TABLE public.community_comments ALTER COLUMN updated_at SET DEFAULT NOW()");
        DB::statement("ALTER TABLE public.community_comments ALTER COLUMN created_at SET NOT NULL");
        DB::statement("ALTER TABLE public.community_comments ALTER COLUMN updated_at SET NOT NULL");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE public.community_comments ALTER COLUMN created_at DROP NOT NULL");
        DB::statement("ALTER TABLE public.community_comments ALTER COLUMN updated_at DROP NOT NULL");
        DB::statement("ALTER TABLE public.community_comments ALTER COLUMN created_at DROP DEFAULT");
        DB::statement("ALTER TABLE public.community_comments ALTER COLUMN updated_at DROP DEFAULT");

        DB::statement("ALTER TABLE public.community_posts ALTER COLUMN created_at DROP NOT NULL");
        DB::statement("ALTER TABLE public.community_posts ALTER COLUMN updated_at DROP NOT NULL");
        DB::statement("ALTER TABLE public.community_posts ALTER COLUMN created_at DROP DEFAULT");
        DB::statement("ALTER TABLE public.community_posts ALTER COLUMN updated_at DROP DEFAULT");
    }
};
