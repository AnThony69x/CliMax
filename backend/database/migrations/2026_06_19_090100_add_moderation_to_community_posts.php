<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('community_posts', function (Blueprint $table): void {
            $table->string('moderation_status', 24)->default('published')->index();
            $table->uuid('moderated_by')->nullable()->index();
            $table->timestamp('moderated_at')->nullable();
            $table->text('moderation_reason')->nullable();
        });

        DB::statement(<<<'SQL'
            ALTER TABLE public.community_posts
            ADD CONSTRAINT community_posts_moderation_status_ck
            CHECK (moderation_status IN ('published', 'hidden', 'flagged', 'removed'))
        SQL);
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE public.community_posts DROP CONSTRAINT IF EXISTS community_posts_moderation_status_ck');
        Schema::table('community_posts', function (Blueprint $table): void {
            $table->dropColumn([
                'moderation_status',
                'moderated_by',
                'moderated_at',
                'moderation_reason',
            ]);
        });
    }
};
