<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Backfill missing avatar_url in profiles from Supabase auth metadata.
        DB::statement(<<<'SQL'
            UPDATE public.profiles p
            SET avatar_url = NULLIF(TRIM(u.raw_user_meta_data->>'avatar_url'), '')
            FROM auth.users u
            WHERE p.id = u.id
              AND (p.avatar_url IS NULL OR BTRIM(p.avatar_url) = '')
              AND NULLIF(TRIM(u.raw_user_meta_data->>'avatar_url'), '') IS NOT NULL
        SQL);
    }

    public function down(): void
    {
        // No-op: avoid deleting profile pictures that may have been updated after backfill.
    }
};
