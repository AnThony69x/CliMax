<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE public.community_posts DROP CONSTRAINT IF EXISTS community_posts_moderation_status_ck');
        if (! Schema::hasColumn('community_posts', 'image_hash')) {
            Schema::table('community_posts', function (Blueprint $table): void {
                $table->string('image_hash', 64)->nullable()->index();
            });
        }
        DB::statement("ALTER TABLE public.community_posts ALTER COLUMN moderation_status SET DEFAULT 'pending_review'");
        DB::statement(<<<'SQL'
            ALTER TABLE public.community_posts
            ADD CONSTRAINT community_posts_moderation_status_ck
            CHECK (moderation_status IN ('pending_review', 'published', 'flagged', 'hidden', 'removed', 'rejected'))
        SQL);

        Schema::table('community_comments', function (Blueprint $table): void {
            if (! Schema::hasColumn('community_comments', 'moderation_status')) {
                $table->string('moderation_status', 24)->default('pending_review')->index();
            }
            if (! Schema::hasColumn('community_comments', 'moderated_by')) {
                $table->uuid('moderated_by')->nullable()->index();
            }
            if (! Schema::hasColumn('community_comments', 'moderated_at')) {
                $table->timestamp('moderated_at')->nullable();
            }
            if (! Schema::hasColumn('community_comments', 'moderation_reason')) {
                $table->text('moderation_reason')->nullable();
            }
        });

        DB::statement('ALTER TABLE public.community_comments DROP CONSTRAINT IF EXISTS community_comments_moderation_status_ck');
        DB::statement(<<<'SQL'
            ALTER TABLE public.community_comments
            ADD CONSTRAINT community_comments_moderation_status_ck
            CHECK (moderation_status IN ('pending_review', 'published', 'flagged', 'hidden', 'removed', 'rejected'))
        SQL);

        Schema::create('content_moderation_reviews', function (Blueprint $table): void {
            $table->id();
            $table->string('target_type', 24);
            $table->uuid('target_id');
            $table->uuid('author_user_id')->nullable()->index();
            $table->unsignedTinyInteger('score')->default(0);
            $table->string('decision', 24)->index();
            $table->json('labels')->nullable();
            $table->json('reasons')->nullable();
            $table->uuid('reviewed_by')->nullable()->index();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            $table->index(['target_type', 'target_id']);
        });

        Schema::create('community_reports', function (Blueprint $table): void {
            $table->id();
            $table->uuid('reporter_user_id')->index();
            $table->string('target_type', 24);
            $table->uuid('target_id');
            $table->string('reason', 80);
            $table->text('details')->nullable();
            $table->string('status', 24)->default('open')->index();
            $table->uuid('resolved_by')->nullable()->index();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->index(['target_type', 'target_id']);
        });

        DB::statement('ALTER TABLE public.content_moderation_reviews ENABLE ROW LEVEL SECURITY');
        DB::statement('ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY');

        DB::statement('DROP POLICY IF EXISTS community_posts_select_authenticated ON public.community_posts');
        DB::statement('DROP POLICY IF EXISTS community_posts_insert_own ON public.community_posts');
        DB::statement('DROP POLICY IF EXISTS community_posts_update_own ON public.community_posts');
        DB::statement('DROP POLICY IF EXISTS community_posts_delete_own ON public.community_posts');
        DB::statement('DROP POLICY IF EXISTS community_comments_select_authenticated ON public.community_comments');
        DB::statement('DROP POLICY IF EXISTS community_comments_insert_own ON public.community_comments');
        DB::statement('DROP POLICY IF EXISTS community_comments_update_own ON public.community_comments');
        DB::statement('DROP POLICY IF EXISTS community_comments_delete_own ON public.community_comments');
        DB::statement(<<<'SQL'
            CREATE POLICY community_posts_select_authenticated
            ON public.community_posts
            FOR SELECT
            TO authenticated
            USING (moderation_status = 'published' OR user_id = (select auth.uid()))
        SQL);
        DB::statement(<<<'SQL'
            CREATE POLICY community_comments_select_authenticated
            ON public.community_comments
            FOR SELECT
            TO authenticated
            USING (moderation_status = 'published' OR user_id = (select auth.uid()))
        SQL);

        DB::statement('REVOKE ALL ON public.content_moderation_reviews FROM anon, authenticated');
        DB::statement('REVOKE ALL ON public.community_reports FROM anon, authenticated');
        DB::statement('REVOKE INSERT, UPDATE, DELETE ON public.community_posts FROM authenticated');
        DB::statement('REVOKE INSERT, UPDATE, DELETE ON public.community_comments FROM authenticated');
        DB::statement('GRANT SELECT ON public.community_posts TO authenticated');
        DB::statement('GRANT SELECT ON public.community_comments TO authenticated');
    }

    public function down(): void
    {
        DB::statement('GRANT INSERT, UPDATE, DELETE ON public.community_comments TO authenticated');
        DB::statement('GRANT INSERT, UPDATE, DELETE ON public.community_posts TO authenticated');

        DB::statement('DROP POLICY IF EXISTS community_comments_select_authenticated ON public.community_comments');
        DB::statement('DROP POLICY IF EXISTS community_posts_select_authenticated ON public.community_posts');
        DB::statement(<<<'SQL'
            CREATE POLICY community_posts_select_authenticated
            ON public.community_posts
            FOR SELECT
            TO authenticated
            USING (true)
        SQL);
        DB::statement(<<<'SQL'
            CREATE POLICY community_comments_select_authenticated
            ON public.community_comments
            FOR SELECT
            TO authenticated
            USING (true)
        SQL);

        Schema::dropIfExists('community_reports');
        Schema::dropIfExists('content_moderation_reviews');

        DB::statement('ALTER TABLE public.community_comments DROP CONSTRAINT IF EXISTS community_comments_moderation_status_ck');
        Schema::table('community_comments', function (Blueprint $table): void {
            $table->dropColumn([
                'moderation_status',
                'moderated_by',
                'moderated_at',
                'moderation_reason',
            ]);
        });

        DB::statement('ALTER TABLE public.community_posts DROP CONSTRAINT IF EXISTS community_posts_moderation_status_ck');
        if (Schema::hasColumn('community_posts', 'image_hash')) {
            Schema::table('community_posts', function (Blueprint $table): void {
                $table->dropColumn('image_hash');
            });
        }
        DB::statement("ALTER TABLE public.community_posts ALTER COLUMN moderation_status SET DEFAULT 'published'");
        DB::statement(<<<'SQL'
            ALTER TABLE public.community_posts
            ADD CONSTRAINT community_posts_moderation_status_ck
            CHECK (moderation_status IN ('published', 'hidden', 'flagged', 'removed'))
        SQL);
    }
};
