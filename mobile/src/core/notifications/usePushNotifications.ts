import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import {
  cachePushToken,
  configureNotificationHandler,
  getCachedPushToken,
  isExpoGo,
  registerForPushNotificationsAsync,
  registerPushTokenWithBackend,
} from './expoPushService';

type NotificationData = {
  alertId?: string;
  [key: string]: unknown;
};

function extractAlertId(response: any | null): string | null {
  if (!response) return null;
  const data = response?.notification?.request?.content?.data as NotificationData | undefined;
  if (!data) return null;
  const id = data.alertId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

type UsePushNotificationsOptions = {
  enabled?: boolean;
};

/**
 * Configura el ciclo de vida de las notificaciones push:
 * - Registra el dispositivo y manda el ExpoPushToken al backend.
 * - Escucha notificaciones recibidas en foreground.
 * - Maneja el tap (response) abriendo /alert/[id] cuando el payload trae alertId.
 * - Atiende también el cold start (app abierta desde una notificación).
 *
 * Llamar una sola vez desde el RootLayout. Si `enabled` es false o estamos en Expo Go,
 * el hook es un no-op silencioso.
 */
export function usePushNotifications(options: UsePushNotificationsOptions = {}): void {
  const { enabled = true } = options;
  const router = useRouter();
  const handledColdStartRef = useRef(false);

  useEffect(() => {
    if (!enabled || isExpoGo()) {
      return;
    }

    let cancelled = false;
    const subs: { remove: () => void }[] = [];

    const handleAlertNavigation = (alertId: string) => {
      router.push({
        pathname: '/alert/[id]',
        params: { id: alertId },
      });
    };

    (async () => {
      const Notifications = await import('expo-notifications');
      if (cancelled) return;

      await configureNotificationHandler();

      const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
        if (__DEV__) {
          console.log('[push] Notificación recibida:', notification.request.content.title);
        }
      });
      subs.push(receivedSub);

      const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
        const alertId = extractAlertId(response);
        if (alertId) handleAlertNavigation(alertId);
      });
      subs.push(responseSub);

      if (!handledColdStartRef.current) {
        handledColdStartRef.current = true;
        try {
          const lastResponse = await Notifications.getLastNotificationResponseAsync();
          const alertId = extractAlertId(lastResponse);
          if (alertId) handleAlertNavigation(alertId);
        } catch {
          // Sin respuesta inicial: caso normal.
        }
      }

      const token = await registerForPushNotificationsAsync();
      if (cancelled || !token) return;

      const cached = await getCachedPushToken();
      if (cached === token) return;

      const sent = await registerPushTokenWithBackend(token);
      if (sent) {
        await cachePushToken(token);
      }
    })().catch((error) => {
      console.warn('[push] Error inicializando notificaciones:', error);
    });

    return () => {
      cancelled = true;
      subs.forEach((sub) => sub.remove());
    };
  }, [enabled, router]);
}
