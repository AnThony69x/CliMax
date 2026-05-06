<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('community_posts', function (Blueprint $table): void {
            $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
            $table->uuid('user_id')->index();
            $table->text('content');
            $table->string('image_url')->nullable();
            $table->string('image_path')->nullable();
            $table->string('severity', 20)->default('informacion');
            $table->timestamps();

            $table->index(['user_id', 'created_at']);
        });

        Schema::create('community_comments', function (Blueprint $table): void {
            $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
            $table->uuid('post_id')->index();
            $table->uuid('user_id')->index();
            $table->text('content');
            $table->uuid('parent_comment_id')->nullable()->index();
            $table->timestamps();

            $table->index(['post_id', 'created_at']);
        });

        DB::statement(<<<'SQL'
            ALTER TABLE public.community_posts
            ADD CONSTRAINT community_posts_severity_ck
            CHECK (severity IN ('informacion', 'alerta', 'grave'))
        SQL);
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE public.community_posts DROP CONSTRAINT IF EXISTS community_posts_severity_ck');
        Schema::dropIfExists('community_comments');
        Schema::dropIfExists('community_posts');
    }
};
