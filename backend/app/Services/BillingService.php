<?php

namespace App\Services;

use App\Models\AccessAuditLog;
use App\Models\SubscriptionCheckoutSession;
use App\Models\SubscriptionPlan;
use App\Models\UserSubscription;
use Illuminate\Support\Facades\Http;

class BillingService
{
    public function createCheckout(
        string $userId,
        SubscriptionPlan $plan,
        string $interval,
        ?string $actorId = null,
        ?string $successUrl = null,
        ?string $cancelUrl = null,
    ): array {
        $provider = config('services.billing.provider', env('BILLING_PROVIDER', 'simulated'));
        $amount = $interval === 'year' ? $plan->yearly_price_cents : $plan->monthly_price_cents;
        $session = SubscriptionCheckoutSession::query()->create([
            'user_id' => $userId,
            'subscription_plan_id' => $plan->id,
            'billing_interval' => $interval,
            'amount_cents' => $amount,
            'currency' => $plan->currency ?? 'usd',
            'payment_provider' => $provider,
            'status' => 'open',
        ]);

        if ($provider === 'stripe' && $plan->key !== 'free') {
            $stripe = $this->createStripeCheckout($session, $plan, $interval, $userId, $successUrl, $cancelUrl);
            $session->update([
                'provider_session_id' => $stripe['id'] ?? null,
                'checkout_url' => $stripe['url'] ?? null,
            ]);

            return [
                'mode' => 'stripe',
                'session' => $session->fresh(),
                'checkout_url' => $stripe['url'] ?? null,
            ];
        }

        $subscription = $this->activateSubscription($session, $actorId);

        return [
            'mode' => 'simulated',
            'session' => $session->fresh(),
            'subscription' => $subscription,
            'checkout_url' => null,
        ];
    }

    public function activateSubscription(SubscriptionCheckoutSession $session, ?string $actorId = null): UserSubscription
    {
        $plan = SubscriptionPlan::query()->findOrFail($session->subscription_plan_id);

        UserSubscription::query()
            ->where('user_id', $session->user_id)
            ->where('status', 'active')
            ->update(['status' => 'canceled']);

        $subscription = UserSubscription::query()->create([
            'user_id' => $session->user_id,
            'subscription_plan_id' => $plan->id,
            'status' => 'active',
            'starts_at' => now(),
            'expires_at' => $session->billing_interval === 'year' ? now()->addYear() : now()->addMonth(),
            'assigned_by' => $actorId,
            'billing_interval' => $session->billing_interval,
            'payment_provider' => $session->payment_provider,
            'provider_checkout_session_id' => $session->provider_session_id ?: (string) $session->id,
        ]);

        $session->update([
            'status' => 'completed',
            'completed_at' => now(),
        ]);

        AccessAuditLog::query()->create([
            'actor_user_id' => $actorId ?? $session->user_id,
            'target_user_id' => $session->user_id,
            'action' => 'subscription.checkout.completed',
            'metadata' => [
                'plan' => $plan->key,
                'billing_interval' => $session->billing_interval,
                'payment_provider' => $session->payment_provider,
                'amount_cents' => $session->amount_cents,
                'currency' => $session->currency,
            ],
        ]);

        return $subscription;
    }

    public function syncCheckout(SubscriptionCheckoutSession $session, ?string $actorId = null): UserSubscription
    {
        if ($session->status === 'completed') {
            $existing = $this->subscriptionForCompletedSession($session);
            if ($existing) {
                return $existing;
            }
        }

        $stripeSession = null;
        if ($session->payment_provider === 'stripe') {
            $stripeSession = $this->retrieveStripeCheckoutSession($session);
            $isComplete = ($stripeSession['status'] ?? null) === 'complete';
            $isPaid = in_array($stripeSession['payment_status'] ?? null, ['paid', 'no_payment_required'], true);

            if (! $isComplete && ! $isPaid) {
                throw new \RuntimeException('Stripe aun no confirma el pago. Intenta actualizar en unos segundos.');
            }

            $session->update([
                'provider_session_id' => $stripeSession['id'] ?? $session->provider_session_id,
            ]);
            $session = $session->fresh();
        }

        $subscription = $this->activateSubscription($session, $actorId);
        $stripeSubscriptionId = is_array($stripeSession) ? ($stripeSession['subscription'] ?? null) : null;

        if (is_string($stripeSubscriptionId) && $stripeSubscriptionId !== '') {
            $subscription->update(['provider_subscription_id' => $stripeSubscriptionId]);
            $subscription = $subscription->fresh();
        }

        return $subscription;
    }

    private function createStripeCheckout(
        SubscriptionCheckoutSession $session,
        SubscriptionPlan $plan,
        string $interval,
        string $userId,
        ?string $successUrlOverride = null,
        ?string $cancelUrlOverride = null,
    ): array {
        $secret = (string) env('STRIPE_SECRET_KEY', '');
        $priceId = $interval === 'year' ? $plan->stripe_yearly_price_id : $plan->stripe_monthly_price_id;

        if ($secret === '' || ! $priceId) {
            throw new \RuntimeException('Stripe no esta configurado para este plan.');
        }

        if (! str_starts_with((string) $priceId, 'price_')) {
            throw new \RuntimeException('Stripe necesita un Price ID que empiece con price_. No uses el Product ID prod_.');
        }

        $fallbackBaseUrl = rtrim((string) env('APP_URL', 'http://localhost'), '/');
        $successUrl = $this->allowedReturnUrl($successUrlOverride)
            ?: config('services.billing.checkout_success_url')
            ?: $fallbackBaseUrl.'/billing/success?session_id={CHECKOUT_SESSION_ID}';
        $cancelUrl = $this->allowedReturnUrl($cancelUrlOverride)
            ?: config('services.billing.checkout_cancel_url')
            ?: $fallbackBaseUrl.'/billing/cancel';
        $successUrl = $this->withLocalSessionId($successUrl, $session);
        $cancelUrl = $this->withLocalSessionId($cancelUrl, $session);

        $response = Http::asForm()
            ->withToken($secret)
            ->post('https://api.stripe.com/v1/checkout/sessions', [
                'mode' => 'subscription',
                'line_items[0][price]' => $priceId,
                'line_items[0][quantity]' => 1,
                'success_url' => $successUrl,
                'cancel_url' => $cancelUrl,
                'client_reference_id' => $userId,
                'metadata[local_session_id]' => (string) $session->id,
                'metadata[user_id]' => $userId,
                'metadata[plan]' => $plan->key,
                'metadata[billing_interval]' => $interval,
            ]);

        if ($response->failed()) {
            throw new \RuntimeException($response->json('error.message') ?? 'No se pudo crear Checkout en Stripe.');
        }

        return $response->json();
    }

    private function retrieveStripeCheckoutSession(SubscriptionCheckoutSession $session): array
    {
        $secret = (string) env('STRIPE_SECRET_KEY', '');
        $providerSessionId = (string) $session->provider_session_id;

        if ($secret === '' || $providerSessionId === '') {
            throw new \RuntimeException('No se puede confirmar el checkout de Stripe porque falta configuracion.');
        }

        $response = Http::withToken($secret)
            ->get('https://api.stripe.com/v1/checkout/sessions/'.rawurlencode($providerSessionId));

        if ($response->failed()) {
            throw new \RuntimeException($response->json('error.message') ?? 'No se pudo confirmar el checkout en Stripe.');
        }

        return $response->json();
    }

    private function allowedReturnUrl(?string $url): ?string
    {
        if (! $url) {
            return null;
        }

        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));

        return in_array($scheme, ['climax', 'exp', 'exps', 'http', 'https'], true) ? $url : null;
    }

    private function withLocalSessionId(string $url, SubscriptionCheckoutSession $session): string
    {
        if (str_contains($url, '{LOCAL_SESSION_ID}')) {
            return str_replace('{LOCAL_SESSION_ID}', (string) $session->id, $url);
        }

        $separator = str_contains($url, '?') ? '&' : '?';

        return $url.$separator.'local_session_id='.$session->id;
    }

    private function subscriptionForCompletedSession(SubscriptionCheckoutSession $session): ?UserSubscription
    {
        $providerCheckoutId = $session->provider_session_id ?: (string) $session->id;

        return UserSubscription::query()
            ->where('user_id', $session->user_id)
            ->where('subscription_plan_id', $session->subscription_plan_id)
            ->where('status', 'active')
            ->where('provider_checkout_session_id', $providerCheckoutId)
            ->latest('starts_at')
            ->first()
            ?? UserSubscription::query()
                ->where('user_id', $session->user_id)
                ->where('subscription_plan_id', $session->subscription_plan_id)
                ->where('status', 'active')
                ->latest('starts_at')
                ->first();
    }
}
