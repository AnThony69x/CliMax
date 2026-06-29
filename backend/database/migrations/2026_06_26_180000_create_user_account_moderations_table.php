<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_account_moderations', function (Blueprint $table): void {
            $table->id();
            $table->uuid('user_id')->unique();
            $table->string('status', 24)->default('active')->index();
            $table->text('reason')->nullable();
            $table->uuid('actioned_by')->nullable()->index();
            $table->timestamp('actioned_at')->nullable();
            $table->timestamp('suspended_until')->nullable();
            $table->timestamps();
        });

        DB::statement(<<<'SQL'
            ALTER TABLE public.user_account_moderations
            ADD CONSTRAINT user_account_moderations_status_ck
            CHECK (status IN ('active', 'suspended', 'banned', 'deleted'))
        SQL);
        DB::statement('ALTER TABLE public.user_account_moderations ENABLE ROW LEVEL SECURITY');
        DB::statement('REVOKE ALL ON public.user_account_moderations FROM anon, authenticated');
        DB::statement('REVOKE ALL ON SEQUENCE public.user_account_moderations_id_seq FROM anon, authenticated');
    }

    public function down(): void
    {
        Schema::dropIfExists('user_account_moderations');
    }
};
