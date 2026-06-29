<?php

namespace App\Interfaces\Controllers;

use App\Http\Controllers\Controller;
use App\Http\Traits\ResolvesSupabaseUser;
use App\Models\AccessAuditLog;
use App\Models\CommunityComment;
use App\Models\CommunityPost;
use App\Models\CommunityReport;
use App\Models\ContentModerationReview;
use App\Services\ContentModerationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CommunityController extends Controller
{
    use ResolvesSupabaseUser;

    public function index(Request $request): JsonResponse
    {
        $userId = $this->resolveSupabaseUserId($request);

        $posts = CommunityPost::query()
            ->where(function ($query) use ($userId): void {
                $query->where('moderation_status', 'published');

                if ($userId) {
                    $query->orWhere('user_id', $userId);
                }
            })
            ->orderByDesc('created_at')
            ->limit(100)
            ->get();

        $comments = CommunityComment::query()
            ->whereIn('post_id', $posts->pluck('id'))
            ->where(function ($query) use ($userId): void {
                $query->where('moderation_status', 'published');

                if ($userId) {
                    $query->orWhere('user_id', $userId);
                }
            })
            ->orderBy('created_at')
            ->get();

        return response()->json([
            'data' => [
                'posts' => $posts,
                'comments' => $comments,
            ],
        ]);
    }

    public function storePost(Request $request, ContentModerationService $moderation): JsonResponse
    {
        $validated = $request->validate([
            'content' => ['required', 'string', 'min:6', 'max:1000'],
            'image_url' => ['required', 'string', 'max:2048'],
            'image_path' => ['sometimes', 'nullable', 'string', 'max:1024'],
            'image_mime_type' => ['sometimes', 'nullable', 'string', 'in:image/jpeg,image/png,image/webp,image/gif'],
            'image_size_bytes' => ['sometimes', 'nullable', 'integer', 'max:10485760'],
            'severity' => ['sometimes', 'string', 'in:informacion,alerta,grave'],
            'initial_comment' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ]);

        $userId = $this->resolveSupabaseUserId($request);
        $analysis = $moderation->analyzeText($validated['content'], true);

        $post = CommunityPost::query()->create([
            'id' => (string) Str::uuid(),
            'user_id' => $userId,
            'content' => $validated['content'],
            'image_url' => $validated['image_url'],
            'image_path' => $validated['image_path'] ?? null,
            'image_hash' => $this->imageHash($validated['image_path'] ?? null, $validated['image_url']),
            'severity' => $validated['severity'] ?? 'informacion',
            'moderation_status' => $analysis['decision'],
            'moderation_reason' => implode(' ', $analysis['reasons']),
        ]);

        $this->createReview('post', $post->id, $userId, $analysis);
        $this->audit($userId, $userId, 'community.post.submitted', [
            'post_id' => $post->id,
            'moderation_status' => $post->moderation_status,
            'score' => $analysis['score'],
            'labels' => $analysis['labels'],
        ]);

        $comment = null;
        $initialComment = trim((string) ($validated['initial_comment'] ?? ''));
        if ($initialComment !== '') {
            $comment = $this->createCommentRow($post->id, $userId, $initialComment, null, $moderation);
        }

        return response()->json([
            'data' => [
                'post' => $post,
                'comment' => $comment,
                'moderation' => $analysis,
            ],
        ], 201);
    }

    public function updatePost(Request $request, string $postId, ContentModerationService $moderation): JsonResponse
    {
        $validated = $request->validate([
            'content' => ['required', 'string', 'min:6', 'max:1000'],
            'image_url' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'image_path' => ['sometimes', 'nullable', 'string', 'max:1024'],
            'image_mime_type' => ['sometimes', 'nullable', 'string', 'in:image/jpeg,image/png,image/webp,image/gif'],
            'image_size_bytes' => ['sometimes', 'nullable', 'integer', 'max:10485760'],
            'severity' => ['sometimes', 'string', 'in:informacion,alerta,grave'],
        ]);

        $userId = $this->resolveSupabaseUserId($request);
        $post = CommunityPost::query()
            ->where('id', $postId)
            ->where('user_id', $userId)
            ->firstOrFail();
        $analysis = $moderation->analyzeText($validated['content'], (bool) ($validated['image_url'] ?? $post->image_url));

        $post->fill([
            'content' => $validated['content'],
            'image_url' => array_key_exists('image_url', $validated) ? $validated['image_url'] : $post->image_url,
            'image_path' => array_key_exists('image_path', $validated) ? $validated['image_path'] : $post->image_path,
            'image_hash' => $this->imageHash($validated['image_path'] ?? $post->image_path, $validated['image_url'] ?? $post->image_url),
            'severity' => $validated['severity'] ?? $post->severity,
            'moderation_status' => $analysis['decision'],
            'moderation_reason' => implode(' ', $analysis['reasons']),
            'moderated_by' => null,
            'moderated_at' => null,
        ]);
        $post->save();

        $this->createReview('post', $post->id, $userId, $analysis);
        $this->audit($userId, $userId, 'community.post.updated', [
            'post_id' => $post->id,
            'moderation_status' => $post->moderation_status,
            'score' => $analysis['score'],
            'labels' => $analysis['labels'],
        ]);

        return response()->json(['data' => ['post' => $post, 'moderation' => $analysis]]);
    }

    public function deletePost(Request $request, string $postId): JsonResponse
    {
        $userId = $this->resolveSupabaseUserId($request);
        $post = CommunityPost::query()
            ->where('id', $postId)
            ->where('user_id', $userId)
            ->firstOrFail();
        $post->delete();

        $this->audit($userId, $userId, 'community.post.deleted', ['post_id' => $postId]);

        return response()->json(['data' => ['id' => $postId]]);
    }

    public function storeComment(Request $request, string $postId, ContentModerationService $moderation): JsonResponse
    {
        $validated = $request->validate([
            'content' => ['required', 'string', 'min:1', 'max:1000'],
            'parent_comment_id' => ['sometimes', 'nullable', 'uuid'],
        ]);

        $post = CommunityPost::query()
            ->where('id', $postId)
            ->where('moderation_status', 'published')
            ->firstOrFail();
        $userId = $this->resolveSupabaseUserId($request);
        $comment = $this->createCommentRow(
            $post->id,
            $userId,
            $validated['content'],
            $validated['parent_comment_id'] ?? null,
            $moderation
        );

        return response()->json(['data' => $comment], 201);
    }

    public function updateComment(Request $request, string $postId, string $commentId, ContentModerationService $moderation): JsonResponse
    {
        $validated = $request->validate([
            'content' => ['required', 'string', 'min:1', 'max:1000'],
        ]);

        $userId = $this->resolveSupabaseUserId($request);
        $comment = CommunityComment::query()
            ->where('id', $commentId)
            ->where('post_id', $postId)
            ->where('user_id', $userId)
            ->firstOrFail();
        $analysis = $moderation->analyzeText($validated['content']);
        $comment->fill([
            'content' => $validated['content'],
            'moderation_status' => $analysis['decision'],
            'moderation_reason' => implode(' ', $analysis['reasons']),
            'moderated_by' => null,
            'moderated_at' => null,
        ]);
        $comment->save();

        $this->createReview('comment', $comment->id, $userId, $analysis);
        $this->audit($userId, $userId, 'community.comment.updated', [
            'post_id' => $postId,
            'comment_id' => $comment->id,
            'moderation_status' => $comment->moderation_status,
            'score' => $analysis['score'],
            'labels' => $analysis['labels'],
        ]);

        return response()->json(['data' => $comment]);
    }

    public function deleteComment(Request $request, string $postId, string $commentId): JsonResponse
    {
        $userId = $this->resolveSupabaseUserId($request);
        $comment = CommunityComment::query()
            ->where('id', $commentId)
            ->where('post_id', $postId)
            ->where('user_id', $userId)
            ->firstOrFail();
        $comment->delete();

        $this->audit($userId, $userId, 'community.comment.deleted', [
            'post_id' => $postId,
            'comment_id' => $commentId,
        ]);

        return response()->json(['data' => ['id' => $commentId]]);
    }

    public function report(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'target_type' => ['required', 'string', 'in:post,comment'],
            'target_id' => ['required', 'uuid'],
            'reason' => ['required', 'string', 'max:80'],
            'details' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ]);

        $userId = $this->resolveSupabaseUserId($request);
        $report = CommunityReport::query()->create([
            'reporter_user_id' => $userId,
            'target_type' => $validated['target_type'],
            'target_id' => $validated['target_id'],
            'reason' => $validated['reason'],
            'details' => $validated['details'] ?? null,
            'status' => 'open',
        ]);

        $this->audit($userId, null, 'community.content.reported', [
            'report_id' => $report->id,
            'target_type' => $report->target_type,
            'target_id' => $report->target_id,
            'reason' => $report->reason,
        ]);

        return response()->json(['data' => $report], 201);
    }

    private function createCommentRow(
        string $postId,
        ?string $userId,
        string $content,
        ?string $parentCommentId,
        ContentModerationService $moderation
    ): CommunityComment {
        $analysis = $moderation->analyzeText($content);
        $comment = CommunityComment::query()->create([
            'id' => (string) Str::uuid(),
            'post_id' => $postId,
            'user_id' => $userId,
            'content' => $content,
            'parent_comment_id' => $parentCommentId,
            'moderation_status' => $analysis['decision'],
            'moderation_reason' => implode(' ', $analysis['reasons']),
        ]);

        $this->createReview('comment', $comment->id, $userId, $analysis);
        $this->audit($userId, $userId, 'community.comment.submitted', [
            'post_id' => $postId,
            'comment_id' => $comment->id,
            'moderation_status' => $comment->moderation_status,
            'score' => $analysis['score'],
            'labels' => $analysis['labels'],
        ]);

        return $comment;
    }

    /**
     * @param array{score:int,decision:string,labels:array<int,string>,reasons:array<int,string>} $analysis
     */
    private function createReview(string $type, string $id, ?string $authorId, array $analysis): void
    {
        ContentModerationReview::query()->create([
            'target_type' => $type,
            'target_id' => $id,
            'author_user_id' => $authorId,
            'score' => $analysis['score'],
            'decision' => $analysis['decision'],
            'labels' => $analysis['labels'],
            'reasons' => $analysis['reasons'],
        ]);
    }

    private function audit(?string $actorId, ?string $targetId, string $action, array $metadata): void
    {
        AccessAuditLog::query()->create([
            'actor_user_id' => $actorId,
            'target_user_id' => $targetId,
            'action' => $action,
            'metadata' => $metadata,
        ]);
    }

    private function imageHash(?string $path, ?string $url): ?string
    {
        $source = $path ?: $url;

        return $source ? hash('sha256', $source) : null;
    }
}
