import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { API_URL } from '../api/weatherApi';
import { getAccessToken } from '../auth/supabaseClient';

const PUSH_TOKEN_STORAGE_KEY = 'climax.push.token';
const ANDROID_CHANNEL_ID = 'default';

/**
 * En Expo Go (SDK 53+) las notificaciones push remotas están deshabilitadas
 * y solo importar `expo-notifications` dispara warnings/errors molestos.
 * Detectamos el entorno y hacemos no-op para no contaminar la consola.
 */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === 'storeClient';
}

let warnedExpoGoOnce = false;
function warnExpoGoOnce(): void {
  if (warnedExpoGoOnce) return;
  warnedExpoGoOnce = true;
  console.log(
    '[push] Estás en Expo Go: las push remotas no funcionan aquí. Usa un development build.'
  );
}

let handlerConfigured = false;
async function loadNotificationsModule(): Promise<typeof import('expo-notifications') | null> {
  if (isExpoGo()) {
    warnExpoGoOnce();
    return null;
  }
  return import('expo-notifications');
}

export async function configureNotificationHandler(): Promise<void> {
  if (handlerConfigured) return;
  const Notifications = await loadNotificationsModule();
  if (!Notifications) return;
  handlerConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function setupAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const Notifications = await loadNotificationsModule();
  if (!Notifications) return;

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Alertas climáticas',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#38bdf8',
    sound: 'default',
  });
}

function resolveProjectId(): string | null {
  const fromExpoConfig = Constants?.expoConfig?.extra?.eas?.projectId;
  const fromEasConfig = (Constants as any)?.easConfig?.projectId;
  const projectId = fromExpoConfig ?? fromEasConfig;
  return typeof projectId === 'string' && projectId.length > 0 ? projectId : null;
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (isExpoGo()) {
    warnExpoGoOnce();
    return null;
  }

  const Notifications = await loadNotificationsModule();
  if (!Notifications) return null;

  const Device = await import('expo-device');
  if (!Device.isDevice) {
    console.warn('[push] Las notificaciones push solo funcionan en dispositivos físicos.');
    return null;
  }

  await configureNotificationHandler();
  await setupAndroidChannel();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[push] Permiso de notificaciones no concedido.');
    return null;
  }

  const projectId = resolveProjectId();
  if (!projectId) {
    console.warn(
      '[push] projectId no configurado. Ejecuta `eas init` y agrega extra.eas.projectId en app.json.'
    );
    return null;
  }

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenResponse.data;
  } catch (error) {
    console.warn('[push] No se pudo obtener el ExpoPushToken:', error);
    return null;
  }
}

export async function getCachedPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await SecureStore.getItemAsync(PUSH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function cachePushToken(token: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.setItemAsync(PUSH_TOKEN_STORAGE_KEY, token);
  } catch (error) {
    console.warn('[push] No se pudo cachear el token:', error);
  }
}

export async function clearCachedPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.deleteItemAsync(PUSH_TOKEN_STORAGE_KEY);
  } catch {
    // Ignorado: si no existe, no pasa nada.
  }
}

/**
 * Envia el ExpoPushToken al backend Laravel para asociarlo al usuario autenticado.
 *
 * Fase 2 (backend): debe existir POST {API_URL}/push-tokens que reciba { token, platform }
 * y haga upsert en una tabla push_tokens. Mientras no exista, esta función solo loggea.
 */
export async function registerPushTokenWithBackend(token: string): Promise<boolean> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return false;
  }

  try {
    const response = await fetch(`${API_URL}/push-tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        token,
        platform: Platform.OS,
      }),
    });

    if (!response.ok) {
      console.warn(`[push] Backend respondió ${response.status} al registrar el token.`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[push] Error de red al registrar el token en el backend:', error);
    return false;
  }
}

/**
 * Notifica al backend que este token debe dejar de recibir notificaciones (logout).
 * Best-effort: si falla no rompe el logout local.
 */
export async function unregisterPushTokenWithBackend(token: string): Promise<void> {
  const accessToken = await getAccessToken();
  if (!accessToken) return;

  try {
    await fetch(`${API_URL}/push-tokens/${encodeURIComponent(token)}`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    // Best-effort.
  }
}

export const PUSH_TOKEN_KEY = PUSH_TOKEN_STORAGE_KEY;
