<?php

namespace App\Services;

use App\Models\FeatureEntitlement;
use App\Models\ProfessionalProfile;
use App\Models\StaffRole;
use App\Models\SubscriptionPlan;
use App\Models\UserSubscription;

class AccessControlService
{
    /** @return array{staff_role: string|null, subscription_plan: string, professional_sector: string|null, entitlements: array<int,string>} */
    public function resolveForUser(?string $userId): array
    {
        if (! $userId) {
            return $this->fallbackAccess();
        }

        $staffRoleValue = StaffRole::query()
            ->where('user_id', $userId)
            ->value('role');
        $staffRole = $this->normalizeStaffRole(is_string($staffRoleValue) ? $staffRoleValue : null);

        $subscription = UserSubscription::query()
            ->with('plan')
            ->where('user_id', $userId)
            ->where('status', 'active')
            ->where(function ($query): void {
                $query->whereNull('starts_at')->orWhere('starts_at', '<=', now());
            })
            ->where(function ($query): void {
                $query->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })
            ->latest('id')
            ->first();

        if (! $subscription) {
            $subscription = $this->activateFreeSubscription($userId);
        }

        $plan = $subscription?->plan?->key
            ?? SubscriptionPlan::query()->where('key', 'free')->value('key')
            ?? 'free';

        $planId = $subscription?->plan?->id
            ?? SubscriptionPlan::query()->where('key', $plan)->value('id');

        $sector = ProfessionalProfile::query()
            ->where('user_id', $userId)
            ->value('sector');

        $entitlements = FeatureEntitlement::query()
            ->where('enabled', true)
            ->where(function ($query) use ($planId, $sector): void {
                $query->where('subscription_plan_id', $planId);
                if ($sector) {
                    $query->orWhere('professional_sector', $sector);
                }
            })
            ->pluck('feature_key')
            ->all();

        $entitlements = $this->withStaffEntitlements($entitlements, $staffRole);

        return [
            'staff_role' => $staffRole ?: null,
            'subscription_plan' => $plan,
            'professional_sector' => $sector ?: null,
            'entitlements' => array_values(array_unique($entitlements)),
        ];
    }

    public function hasStaffRole(?string $userId, array $roles): bool
    {
        $access = $this->resolveForUser($userId);
        return $access['staff_role'] !== null && in_array($access['staff_role'], $roles, true);
    }

    public function hasEntitlement(?string $userId, string $feature): bool
    {
        $access = $this->resolveForUser($userId);
        return in_array($feature, $access['entitlements'], true);
    }

    /**
     * @param array<int,string> $userIds
     * @return array<string,array{staff_role: string|null, subscription_plan: string, professional_sector: string|null, entitlements: array<int,string>}>
     */
    public function resolveForUsers(array $userIds): array
    {
        $userIds = array_values(array_unique(array_filter($userIds, static fn ($id) => is_string($id) && $id !== '')));
        if ($userIds === []) {
            return [];
        }

        $staffRoles = StaffRole::query()
            ->whereIn('user_id', $userIds)
            ->pluck('role', 'user_id')
            ->all();

        $subscriptions = UserSubscription::query()
            ->with('plan')
            ->whereIn('user_id', $userIds)
            ->where('status', 'active')
            ->where(function ($query): void {
                $query->whereNull('starts_at')->orWhere('starts_at', '<=', now());
            })
            ->where(function ($query): void {
                $query->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })
            ->orderByDesc('id')
            ->get()
            ->unique('user_id')
            ->keyBy('user_id');

        $sectors = ProfessionalProfile::query()
            ->whereIn('user_id', $userIds)
            ->pluck('sector', 'user_id')
            ->all();

        $freePlan = SubscriptionPlan::query()->where('key', 'free')->first();
        $planIds = $subscriptions
            ->map(fn (UserSubscription $subscription) => $subscription->plan?->id)
            ->filter()
            ->values()
            ->all();
        if ($freePlan) {
            $planIds[] = $freePlan->id;
        }

        $sectorValues = array_values(array_unique(array_filter($sectors)));
        $entitlements = FeatureEntitlement::query()
            ->where('enabled', true)
            ->where(function ($query) use ($planIds, $sectorValues): void {
                if ($planIds !== []) {
                    $query->whereIn('subscription_plan_id', array_values(array_unique($planIds)));
                }
                if ($sectorValues !== []) {
                    $planIds !== []
                        ? $query->orWhereIn('professional_sector', $sectorValues)
                        : $query->whereIn('professional_sector', $sectorValues);
                }
            })
            ->get(['subscription_plan_id', 'professional_sector', 'feature_key']);

        $byPlanId = [];
        $bySector = [];
        foreach ($entitlements as $entitlement) {
            if ($entitlement->subscription_plan_id) {
                $byPlanId[$entitlement->subscription_plan_id][] = $entitlement->feature_key;
            }
            if ($entitlement->professional_sector) {
                $bySector[$entitlement->professional_sector][] = $entitlement->feature_key;
            }
        }

        $resolved = [];
        foreach ($userIds as $userId) {
            /** @var UserSubscription|null $subscription */
            $subscription = $subscriptions->get($userId);
            $plan = $subscription?->plan?->key ?? $freePlan?->key ?? 'free';
            $planId = $subscription?->plan?->id ?? $freePlan?->id;
            $sector = is_string($sectors[$userId] ?? null) ? $sectors[$userId] : null;
            $staffRole = $this->normalizeStaffRole(is_string($staffRoles[$userId] ?? null) ? $staffRoles[$userId] : null);

            $userEntitlements = [];
            if ($planId && isset($byPlanId[$planId])) {
                $userEntitlements = array_merge($userEntitlements, $byPlanId[$planId]);
            }
            if ($sector && isset($bySector[$sector])) {
                $userEntitlements = array_merge($userEntitlements, $bySector[$sector]);
            }
            $userEntitlements = $this->withStaffEntitlements($userEntitlements, $staffRole);

            $resolved[$userId] = [
                'staff_role' => $staffRole ?: null,
                'subscription_plan' => $plan,
                'professional_sector' => $sector ?: null,
                'entitlements' => array_values(array_unique($userEntitlements)),
            ];
        }

        return $resolved;
    }

    /** @return array{staff_role: null, subscription_plan: string, professional_sector: null, entitlements: array<int,string>} */
    private function fallbackAccess(): array
    {
        return [
            'staff_role' => null,
            'subscription_plan' => 'free',
            'professional_sector' => null,
            'entitlements' => [
                'weather.current',
                'community.basic',
                'alerts.basic',
                'weather.history.short',
            ],
        ];
    }

    private function normalizeStaffRole(?string $role): ?string
    {
        $normalized = strtolower(trim((string) $role));

        return in_array($normalized, ['admin', 'operator'], true) ? $normalized : null;
    }

    private function activateFreeSubscription(string $userId): ?UserSubscription
    {
        $freePlan = SubscriptionPlan::query()->where('key', 'free')->first();
        if (! $freePlan) {
            return null;
        }

        return UserSubscription::query()->create([
            'user_id' => $userId,
            'subscription_plan_id' => $freePlan->id,
            'status' => 'active',
            'starts_at' => now(),
            'payment_provider' => 'system',
        ])->load('plan');
    }

    /** @param array<int,string> $entitlements */
    private function withStaffEntitlements(array $entitlements, ?string $staffRole): array
    {
        if ($staffRole === 'admin') {
            return array_merge($entitlements, [
                'admin.users.manage',
                'admin.roles.manage',
                'admin.subscriptions.manage',
                'admin.audit.view',
                'community.moderate',
                'operator.users.view',
                'weather.history.extended',
                'weather.history.export',
            ]);
        }

        if ($staffRole === 'operator') {
            return array_merge($entitlements, [
                'community.moderate',
                'operator.users.view',
            ]);
        }

        return $entitlements;
    }
}
