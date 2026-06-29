<?php

namespace App\Interfaces\Controllers;

use App\Http\Controllers\Controller;
use App\Http\Traits\ResolvesSupabaseUser;
use App\Models\AccessAuditLog;
use App\Models\CommunityComment;
use App\Models\CommunityPost;
use App\Models\CommunityReport;
use App\Models\ContentModerationReview;
use App\Models\Profile;
use App\Models\StaffRole;
use App\Models\UserAccountModeration;
use App\Models\UserSubscription;
use App\Services\AccessControlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OperatorCommunityController extends Controller
{
    use ResolvesSupabaseUser;

    public function users(AccessControlService $accessControl): JsonResponse
    {
        $profiles = Profile::query()
            ->orderByDesc('created_at')
            ->limit(200)
            ->get();
        $emailsByUserId = $this->authEmailsByUserId($profiles->pluck('id')->all());
        $accessByUserId = $accessControl->resolveForUsers($profiles->pluck('id')->all());
        $moderationsByUserId = UserAccountModeration::query()
            ->whereIn('user_id', $profiles->pluck('id'))
            ->get()
            ->keyBy('user_id');

        return response()->json([
            'data' => $profiles->map(fn (Profile $profile) => [
                'id' => $profile->id,
                'name' => $profile->name,
                'email' => $emailsByUserId[$profile->id] ?? null,
                'avatar_url' => $profile->avatar_url,
                'created_at' => $profile->created_at,
                'access' => $accessByUserId[$profile->id] ?? [
                    'staff_role' => null,
                    'subscription_plan' => 'free',
                    'professional_sector' => null,
                    'entitlements' => [],
                ],
                'account_moderation' => $this->formatAccountModeration($moderationsByUserId->get($profile->id)),
            ])->values(),
        ]);
    }

    public function posts(): JsonResponse
    {
        $reports = CommunityReport::query()
            ->where('status', 'open')
            ->orderByDesc('created_at')
            ->limit(100)
            ->get();
        $reportedPostIds = $reports->where('target_type', 'post')->pluck('target_id')->unique()->values();
        $reportedCommentIds = $reports->where('target_type', 'comment')->pluck('target_id')->unique()->values();

        $posts = CommunityPost::query()
            ->whereIn('id', $reportedPostIds)
            ->orderByRaw("CASE moderation_status WHEN 'pending_review' THEN 0 WHEN 'flagged' THEN 1 ELSE 2 END")
            ->orderByDesc('created_at')
            ->get();
        $comments = CommunityComment::query()
            ->whereIn('id', $reportedCommentIds)
            ->orderByRaw("CASE moderation_status WHEN 'pending_review' THEN 0 WHEN 'flagged' THEN 1 ELSE 2 END")
            ->orderBy('created_at')
            ->get();
        $reviews = ContentModerationReview::query()
            ->where(function ($query) use ($posts, $comments): void {
                $query->where(function ($postQuery) use ($posts): void {
                    $postQuery->where('target_type', 'post')->whereIn('target_id', $posts->pluck('id'));
                })->orWhere(function ($commentQuery) use ($comments): void {
                    $commentQuery->where('target_type', 'comment')->whereIn('target_id', $comments->pluck('id'));
                });
            })
            ->orderByDesc('created_at')
            ->get()
            ->groupBy(fn (ContentModerationReview $review) => $review->target_type.':'.$review->target_id);

        $reportedPosts = $posts->keyBy('id');
        $reportedComments = $comments->keyBy('id');

        return response()->json([
            'data' => [
                'posts' => $posts,
                'comments' => $comments,
                'reviews' => $reviews,
                'reports' => $reports->map(fn (CommunityReport $report) => [
                    'id' => $report->id,
                    'target_type' => $report->target_type,
                    'target_id' => $report->target_id,
                    'reason' => $report->reason,
                    'details' => $report->details,
                    'status' => $report->status,
                    'created_at' => $report->created_at,
                    'target' => $report->target_type === 'post'
                        ? $reportedPosts->get($report->target_id)
                        : $reportedComments->get($report->target_id),
                ])->values(),
            ],
        ]);
    }

    public function moderate(Request $request, string $id): JsonResponse
    {
        $validated = $request->validate([
            'moderation_status' => ['required', 'string', 'in:pending_review,published,hidden,flagged,removed,rejected'],
            'moderation_reason' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ]);

        $actorId = $this->resolveSupabaseUserId($request);
        $post = CommunityPost::query()->findOrFail($id);
        $post->fill([
            'moderation_status' => $validated['moderation_status'],
            'moderation_reason' => $validated['moderation_reason'] ?? $this->defaultModerationReason($validated['moderation_status']),
            'moderated_by' => $actorId,
            'moderated_at' => now(),
        ]);
        $post->save();
        $this->resolveReports('post', $post->id, $actorId);

        AccessAuditLog::query()->create([
            'actor_user_id' => $actorId,
            'target_user_id' => $post->user_id,
            'action' => 'community.post.moderated',
            'metadata' => [
                'post_id' => $post->id,
                'moderation_status' => $post->moderation_status,
                'moderation_reason' => $post->moderation_reason,
            ],
        ]);

        return response()->json(['data' => $post]);
    }

    public function moderateComment(Request $request, string $id): JsonResponse
    {
        $validated = $request->validate([
            'moderation_status' => ['required', 'string', 'in:pending_review,published,hidden,flagged,removed,rejected'],
            'moderation_reason' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ]);

        $actorId = $this->resolveSupabaseUserId($request);
        $comment = CommunityComment::query()->findOrFail($id);
        $comment->fill([
            'moderation_status' => $validated['moderation_status'],
            'moderation_reason' => $validated['moderation_reason'] ?? $this->defaultModerationReason($validated['moderation_status']),
            'moderated_by' => $actorId,
            'moderated_at' => now(),
        ]);
        $comment->save();
        $this->resolveReports('comment', $comment->id, $actorId);

        AccessAuditLog::query()->create([
            'actor_user_id' => $actorId,
            'target_user_id' => $comment->user_id,
            'action' => 'community.comment.moderated',
            'metadata' => [
                'comment_id' => $comment->id,
                'post_id' => $comment->post_id,
                'moderation_status' => $comment->moderation_status,
                'moderation_reason' => $comment->moderation_reason,
            ],
        ]);

        return response()->json(['data' => $comment]);
    }

    public function updateUserStatus(Request $request, string $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', 'in:active,suspended,banned,deleted'],
            'reason' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'suspended_until' => ['sometimes', 'nullable', 'date'],
        ]);

        $actorId = $this->resolveSupabaseUserId($request);
        if ($actorId === $id && $validated['status'] !== 'active') {
            return response()->json(['message' => 'No puedes aplicar esta accion sobre tu propia cuenta.'], 422);
        }

        $actorRole = StaffRole::query()->where('user_id', $actorId)->value('role');
        $targetRole = StaffRole::query()->where('user_id', $id)->value('role');
        if ($actorRole !== 'admin' && in_array($targetRole, ['admin', 'operator'], true)) {
            return response()->json(['message' => 'Solo un admin puede controlar cuentas admin u operador.'], 403);
        }

        $status = $validated['status'];
        $reason = $validated['reason'] ?? $this->defaultAccountReason($status);
        $suspendedUntil = $status === 'suspended'
            ? ($validated['suspended_until'] ?? now()->addDays(7))
            : null;

        $moderation = UserAccountModeration::query()->updateOrCreate(
            ['user_id' => $id],
            [
                'status' => $status,
                'reason' => $status === 'active' ? null : $reason,
                'actioned_by' => $actorId,
                'actioned_at' => now(),
                'suspended_until' => $suspendedUntil,
            ]
        );

        if ($status === 'deleted') {
            UserSubscription::query()->where('user_id', $id)->where('status', 'active')->update(['status' => 'canceled']);
            StaffRole::query()->where('user_id', $id)->delete();
            Profile::query()->where('id', $id)->update([
                'name' => 'Usuario eliminado',
                'avatar_url' => null,
            ]);
        }

        AccessAuditLog::query()->create([
            'actor_user_id' => $actorId,
            'target_user_id' => $id,
            'action' => 'user.account.'.$status,
            'metadata' => [
                'status' => $status,
                'reason' => $moderation->reason,
                'suspended_until' => $moderation->suspended_until?->toISOString(),
            ],
        ]);

        return response()->json(['data' => $this->formatAccountModeration($moderation)]);
    }

    private function authEmailsByUserId(array $userIds): array
    {
        if ($userIds === []) {
            return [];
        }

        try {
            return DB::table('auth.users')
                ->whereIn('id', $userIds)
                ->pluck('email', 'id')
                ->all();
        } catch (\Throwable) {
            return [];
        }
    }

    private function resolveReports(string $targetType, string $targetId, string $actorId): void
    {
        CommunityReport::query()
            ->where('target_type', $targetType)
            ->where('target_id', $targetId)
            ->where('status', 'open')
            ->update([
                'status' => 'resolved',
                'resolved_by' => $actorId,
                'resolved_at' => now(),
            ]);
    }

    private function defaultModerationReason(string $status): ?string
    {
        return match ($status) {
            'removed' => 'Tu contenido fue eliminado porque infringe las normas de la aplicacion.',
            'rejected' => 'Tu contenido fue rechazado porque infringe las normas de la aplicacion.',
            'hidden' => 'Tu contenido fue ocultado por incumplir las normas de la aplicacion.',
            'flagged' => 'Tu contenido fue marcado para revision por posible incumplimiento de normas.',
            default => null,
        };
    }

    private function defaultAccountReason(string $status): ?string
    {
        return match ($status) {
            'suspended' => 'Tu cuenta fue suspendida temporalmente por infringir las normas de la aplicacion.',
            'banned' => 'Tu cuenta fue baneada por infringir las normas de la aplicacion.',
            'deleted' => 'Tu cuenta fue eliminada por administracion debido a incumplimiento de normas.',
            default => null,
        };
    }

    private function formatAccountModeration(?UserAccountModeration $moderation): array
    {
        return [
            'status' => $moderation?->status ?? 'active',
            'reason' => $moderation?->reason,
            'suspended_until' => $moderation?->suspended_until?->toISOString(),
            'actioned_by' => $moderation?->actioned_by,
            'actioned_at' => $moderation?->actioned_at?->toISOString(),
        ];
    }
}
