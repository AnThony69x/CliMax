<?php

namespace App\Interfaces\Controllers;

use App\Http\Controllers\Controller;
use App\Http\Traits\ResolvesSupabaseUser;
use App\Models\SubscriptionCheckoutSession;
use App\Models\SubscriptionPlan;
use App\Services\AccessControlService;
use App\Services\BillingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class BillingController extends Controller
{
    use ResolvesSupabaseUser;

    public function plans(): JsonResponse
    {
        return response()->json([
            'data' => SubscriptionPlan::query()
                ->where('is_active', true)
                ->orderByRaw("CASE key WHEN 'free' THEN 0 WHEN 'premium' THEN 1 ELSE 2 END")
                ->get(),
        ]);
    }

    public function checkout(Request $request, BillingService $billing): JsonResponse
    {
        $validated = $request->validate([
            'plan' => ['required', 'string', 'in:free,premium,professional'],
            'billing_interval' => ['required', 'string', 'in:month,year'],
            'success_url' => ['sometimes', 'string', 'max:500'],
            'cancel_url' => ['sometimes', 'string', 'max:500'],
        ]);

        $userId = $this->resolveSupabaseUserId($request);
        $plan = SubscriptionPlan::query()->where('key', $validated['plan'])->where('is_active', true)->firstOrFail();
        $payload = $billing->createCheckout(
            $userId,
            $plan,
            $validated['billing_interval'],
            null,
            $validated['success_url'] ?? null,
            $validated['cancel_url'] ?? null,
        );

        return response()->json(['data' => $payload]);
    }

    public function simulateSuccess(Request $request, BillingService $billing, AccessControlService $access): JsonResponse
    {
        $validated = $request->validate([
            'checkout_session_id' => ['required', 'integer'],
        ]);

        $userId = $this->resolveSupabaseUserId($request);
        $session = SubscriptionCheckoutSession::query()
            ->where('id', $validated['checkout_session_id'])
            ->where('user_id', $userId)
            ->firstOrFail();

        $subscription = $billing->syncCheckout($session, $userId);

        return response()->json([
            'data' => [
                'subscription' => $subscription,
                'access' => $access->resolveForUser($userId),
            ],
        ]);
    }

    public function syncCheckout(Request $request, BillingService $billing, AccessControlService $access): JsonResponse
    {
        $validated = $request->validate([
            'checkout_session_id' => ['required', 'integer'],
        ]);

        $userId = $this->resolveSupabaseUserId($request);
        $session = SubscriptionCheckoutSession::query()
            ->where('id', $validated['checkout_session_id'])
            ->where('user_id', $userId)
            ->firstOrFail();

        try {
            $subscription = $billing->syncCheckout($session, $userId);
        } catch (\RuntimeException $error) {
            return response()->json(['message' => $error->getMessage()], 409);
        }

        return response()->json([
            'data' => [
                'subscription' => $subscription,
                'session' => $session->fresh(),
                'access' => $access->resolveForUser($userId),
            ],
        ]);
    }

    public function stripeWebhook(Request $request, BillingService $billing): JsonResponse
    {
        $secret = (string) env('STRIPE_WEBHOOK_SECRET', '');
        $payload = $request->getContent();

        if ($secret !== '' && ! $this->hasValidStripeSignature($payload, (string) $request->header('Stripe-Signature'), $secret)) {
            return response()->json(['message' => 'Firma invalida.'], 400);
        }

        $event = json_decode($payload, true);
        if (! is_array($event)) {
            return response()->json(['message' => 'Payload invalido.'], 400);
        }

        if (($event['type'] ?? null) === 'checkout.session.completed') {
            $sessionObject = $event['data']['object'] ?? [];
            $localSessionId = $sessionObject['metadata']['local_session_id'] ?? null;

            if ($localSessionId) {
                $session = SubscriptionCheckoutSession::query()->find($localSessionId);
                if ($session && $session->status !== 'completed') {
                    $session->update([
                        'provider_session_id' => $sessionObject['id'] ?? $session->provider_session_id,
                    ]);
                    $billing->activateSubscription($session, null);
                }
            }
        }

        return response()->json(['received' => true]);
    }

    public function returnFromCheckout(Request $request, BillingService $billing): Response
    {
        $status = $request->query('status') === 'cancel' ? 'cancel' : 'success';
        $appUrl = $this->safeAppReturnUrl((string) $request->query('app_url', ''));
        $localSessionId = (int) $request->query('local_session_id', 0);
        $syncStatus = null;

        if ($status === 'success' && $localSessionId > 0) {
            $session = SubscriptionCheckoutSession::query()->find($localSessionId);

            if ($session) {
                try {
                    $billing->syncCheckout($session, null);
                    $syncStatus = 'ok';
                } catch (\RuntimeException) {
                    $syncStatus = 'pending';
                }
            }
        }

        $title = $status === 'success' ? 'Pago completado' : 'Pago cancelado';
        $message = match (true) {
            $status !== 'success' => 'No se completo el pago. Puedes volver a CliMax e intentarlo de nuevo.',
            $syncStatus === 'ok' => 'Listo. Tu suscripcion ya fue actualizada en CliMax.',
            default => 'Listo. Vuelve a CliMax para actualizar tu suscripcion.',
        };
        $button = $status === 'success' ? 'Abrir CliMax' : 'Volver a CliMax';

        if (! $appUrl) {
            $appUrl = 'climax://subscriptions?checkout='.$status;
        }

        if ($localSessionId > 0) {
            $appUrl = $this->appendAppReturnQuery($appUrl, [
                'checkout_session_id' => (string) $localSessionId,
                'sync' => $syncStatus ?? 'pending',
            ]);
        }

        $safeTitle = e($title);
        $safeMessage = e($message);
        $safeButton = e($button);
        $safeAppUrl = e($appUrl);

        return response(<<<HTML
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{$safeTitle}</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #07111f;
      color: #f8fafc;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(420px, calc(100vw - 32px));
      text-align: center;
    }
    h1 { margin: 0 0 12px; font-size: 28px; }
    p { margin: 0 0 24px; color: #cbd5e1; line-height: 1.5; }
    a {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      min-height: 48px;
      padding: 0 22px;
      border-radius: 8px;
      background: #22c55e;
      color: #052e16;
      font-weight: 800;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <main>
    <h1>{$safeTitle}</h1>
    <p>{$safeMessage}</p>
    <a href="{$safeAppUrl}">{$safeButton}</a>
  </main>
  <script>
    setTimeout(function () {
      window.location.href = "{$safeAppUrl}";
    }, 400);
  </script>
</body>
</html>
HTML);
    }

    private function hasValidStripeSignature(string $payload, string $header, string $secret): bool
    {
        $timestamp = null;
        $signatures = [];

        foreach (explode(',', $header) as $part) {
            [$key, $value] = array_pad(explode('=', $part, 2), 2, null);
            if ($key === 't') {
                $timestamp = $value;
            }
            if ($key === 'v1' && $value) {
                $signatures[] = $value;
            }
        }

        if (! $timestamp || $signatures === []) {
            return false;
        }

        $expected = hash_hmac('sha256', $timestamp.'.'.$payload, $secret);

        foreach ($signatures as $signature) {
            if (hash_equals($expected, $signature)) {
                return true;
            }
        }

        return false;
    }

    private function safeAppReturnUrl(string $url): ?string
    {
        if ($url === '') {
            return null;
        }

        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));

        return in_array($scheme, ['climax', 'exp', 'exps'], true) ? $url : null;
    }

    private function appendAppReturnQuery(string $url, array $params): string
    {
        [$base, $fragment] = array_pad(explode('#', $url, 2), 2, '');
        $separator = str_contains($base, '?') ? '&' : '?';
        $nextUrl = $base.$separator.http_build_query($params);

        return $fragment !== '' ? $nextUrl.'#'.$fragment : $nextUrl;
    }
}
