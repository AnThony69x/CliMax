<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Backfill missing public.profiles rows from Supabase auth.users.
        DB::statement(<<<'SQL'
            INSERT INTO public.profiles (id, name, created_at, updated_at)
            SELECT
                u.id,
                NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'name', '')), ''),
                NOW(),
                NOW()
            FROM auth.users u
            LEFT JOIN public.profiles p ON p.id = u.id
            WHERE p.id IS NULL
        SQL);
    }

    public function down(): void
    {
        // Intentionally no-op to avoid removing legitimate profiles created after backfill.
    }
};
