<?php

namespace App\Interfaces\Controllers;

use App\Http\Controllers\Controller;
use App\Http\Traits\ResolvesSupabaseUser;
use App\Models\AccessAuditLog;
use App\Models\CommunityComment;
use App\Models\CommunityPost;
use App\Models\CommunityReport;
use App\Models\IntelligentAlert;
use App\Models\ProfessionalProfile;
use App\Models\Profile;
use App\Models\StaffRole;
use App\Models\SubscriptionPlan;
use App\Models\UserSubscription;
use App\Models\UserAccountModeration;
use App\Models\WeatherLog;
use App\Services\AccessControlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminAccessController extends Controller
{
    use ResolvesSupabaseUser;

    public function dashboard(): JsonResponse
    {
        $totalUsers = Profile::query()->count();
        $staffCounts = StaffRole::query()
            ->select('role', DB::raw('count(*) as total'))
            ->groupBy('role')
            ->pluck('total', 'role');
        $activeSubscriptionCounts = UserSubscription::query()
            ->join('subscription_plans', 'user_subscriptions.subscription_plan_id', '=', 'subscription_plans.id')
            ->where('user_subscriptions.status', 'active')
            ->where(function ($query): void {
                $query->whereNull('user_subscriptions.starts_at')->orWhere('user_subscriptions.starts_at', '<=', now());
            })
            ->where(function ($query): void {
                $query->whereNull('user_subscriptions.expires_at')->orWhere('user_subscriptions.expires_at', '>', now());
            })
            ->select('subscription_plans.key', DB::raw('count(distinct user_subscriptions.user_id) as total'))
            ->groupBy('subscription_plans.key')
            ->pluck('total', 'subscription_plans.key');
        $assignedPlanTotal = (int) $activeSubscriptionCounts->sum();
        $communityCounts = CommunityPost::query()
            ->select('moderation_status', DB::raw('count(*) as total'))
            ->groupBy('moderation_status')
            ->pluck('total', 'moderation_status');
        $commentCounts = CommunityComment::query()
            ->select('moderation_status', DB::raw('count(*) as total'))
            ->groupBy('moderation_status')
            ->pluck('total', 'moderation_status');
        $recentWeatherQuery = WeatherLog::query()->where('captured_at', '>=', now()->subDays(7));
        $recentAlertQuery = IntelligentAlert::query()->where('created_at', '>=', now()->subDays(7));

        return response()->json([
            'data' => [
                'users' => [
                    'total' => $totalUsers,
                    'recent_7d' => Profile::query()->where('created_at', '>=', now()->subDays(7))->count(),
                ],
                'roles' => [
                    'admin' => (int) ($staffCounts['admin'] ?? 0),
                    'operator' => (int) ($staffCounts['operator'] ?? 0),
                    'none' => max(0, $totalUsers - (int) $staffCounts->sum()),
                ],
                'plans' => [
                    'free' => max(0, $totalUsers - $assignedPlanTotal) + (int) ($activeSubscriptionCounts['free'] ?? 0),
                    'premium' => (int) ($activeSubscriptionCounts['premium'] ?? 0),
                    'professional' => (int) ($activeSubscriptionCounts['professional'] ?? 0),
                ],
                'community' => [
                    'total' => CommunityPost::query()->count(),
                    'comments_total' => CommunityComment::query()->count(),
                    'pending_review' => (int) ($communityCounts['pending_review'] ?? 0),
                    'published' => (int) ($communityCounts['published'] ?? 0),
                    'flagged' => (int) ($communityCounts['flagged'] ?? 0),
                    'hidden' => (int) ($communityCounts['hidden'] ?? 0),
                    'removed' => (int) ($communityCounts['removed'] ?? 0),
                    'rejected' => (int) ($communityCounts['rejected'] ?? 0),
                    'comments_pending_review' => (int) ($commentCounts['pending_review'] ?? 0),
                    'comments_flagged' => (int) ($commentCounts['flagged'] ?? 0),
                    'reports_open' => CommunityReport::query()->where('status', 'open')->count(),
                ],
                'weather' => [
                    'logs_7d' => (clone $recentWeatherQuery)->count(),
                    'active_users_7d' => (clone $recentWeatherQuery)->whereNotNull('user_id')->distinct('user_id')->count('user_id'),
                    'guest_logs_7d' => (clone $recentWeatherQuery)->where('is_guest', true)->count(),
                ],
                'alerts' => [
                    'total_7d' => (clone $recentAlertQuery)->count(),
                    'unread' => IntelligentAlert::query()->where('is_read', false)->count(),
                    'high_risk_7d' => (clone $recentAlertQuery)->whereIn('risk_level', ['high', 'severe'])->count(),
                ],
                'audit' => [
                    'total' => AccessAuditLog::query()->count(),
                    'recent' => AccessAuditLog::query()
                        ->orderByDesc('created_at')
                        ->limit(10)
                        ->get(),
                ],
            ],
        ]);
    }

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
                'updated_at' => $profile->updated_at,
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

    public function updateRole(Request $request, string $id): JsonResponse
    {
        $validated = $request->validate([
            'role' => ['nullable', 'string', 'in:admin,operator'],
        ]);

        $actorId = $this->resolveSupabaseUserId($request);
        $role = $validated['role'] ?? null;

        if ($role === null) {
            StaffRole::query()->where('user_id', $id)->delete();
        } else {
            StaffRole::query()->updateOrCreate(
                ['user_id' => $id],
                [
                    'role' => $role,
                    'assigned_by' => $actorId,
                    'assigned_at' => now(),
                ]
            );
        }

        $this->audit($actorId, $id, 'staff_role.updated', ['role' => $role]);

        return response()->json([
            'data' => [
                'id' => $id,
                'role' => $role,
            ],
        ]);
    }

    public function updateSubscription(Request $request, string $id): JsonResponse
    {
        $validated = $request->validate([
            'plan' => ['required', 'string', 'in:free,premium,professional'],
            'status' => ['sometimes', 'string', 'in:active,canceled,expired'],
            'expires_at' => ['sometimes', 'nullable', 'date'],
            'professional_sector' => [
                'sometimes',
                'nullable',
                'string',
                'in:architecture,construction,agriculture,logistics,insurance,energy,risk_management,urban_planning,research',
            ],
        ]);

        $actorId = $this->resolveSupabaseUserId($request);
        $plan = SubscriptionPlan::query()->where('key', $validated['plan'])->firstOrFail();

        UserSubscription::query()
            ->where('user_id', $id)
            ->where('status', 'active')
            ->update(['status' => 'canceled']);

        $subscription = UserSubscription::query()->create([
            'user_id' => $id,
            'subscription_plan_id' => $plan->id,
            'status' => $validated['status'] ?? 'active',
            'starts_at' => now(),
            'expires_at' => $validated['expires_at'] ?? null,
            'assigned_by' => $actorId,
        ]);

        if (array_key_exists('professional_sector', $validated)) {
            if ($validated['professional_sector'] === null) {
                ProfessionalProfile::query()->where('user_id', $id)->delete();
            } else {
                ProfessionalProfile::query()->updateOrCreate(
                    ['user_id' => $id],
                    ['sector' => $validated['professional_sector']]
                );
            }
        }

        $this->audit($actorId, $id, 'subscription.updated', [
            'plan' => $validated['plan'],
            'status' => $subscription->status,
            'professional_sector' => $validated['professional_sector'] ?? null,
        ]);

        return response()->json([
            'data' => [
                'user_id' => $id,
                'plan' => $validated['plan'],
                'status' => $subscription->status,
                'professional_sector' => $validated['professional_sector'] ?? null,
            ],
        ]);
    }

    public function plans(): JsonResponse
    {
        return response()->json([
            'data' => SubscriptionPlan::query()
                ->orderByRaw("CASE key WHEN 'free' THEN 0 WHEN 'premium' THEN 1 ELSE 2 END")
                ->get(),
        ]);
    }

    public function updatePlan(Request $request, string $key): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'currency' => ['sometimes', 'string', 'size:3'],
            'monthly_price_cents' => ['sometimes', 'integer', 'min:0'],
            'yearly_price_cents' => ['sometimes', 'integer', 'min:0'],
            'stripe_monthly_price_id' => ['sometimes', 'nullable', 'string', 'max:120'],
            'stripe_yearly_price_id' => ['sometimes', 'nullable', 'string', 'max:120'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $plan = SubscriptionPlan::query()->where('key', $key)->firstOrFail();
        $plan->fill($validated);
        if (isset($validated['currency'])) {
            $plan->currency = strtolower($validated['currency']);
        }
        $plan->save();

        $actorId = $this->resolveSupabaseUserId($request);
        $this->audit($actorId, null, 'subscription_plan.updated', [
            'plan' => $plan->key,
            'monthly_price_cents' => $plan->monthly_price_cents,
            'yearly_price_cents' => $plan->yearly_price_cents,
            'currency' => $plan->currency,
        ]);

        return response()->json(['data' => $plan]);
    }

    public function auditLogs(): JsonResponse
    {
        return response()->json([
            'data' => AccessAuditLog::query()
                ->orderByDesc('created_at')
                ->limit(200)
                ->get(),
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
