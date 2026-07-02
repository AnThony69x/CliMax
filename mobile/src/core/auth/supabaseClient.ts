import { createClient, SignInWithPasswordCredentials } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { clearToken, saveToken } from './authStorage';
import { getAuthRedirectUrl } from './authRedirect';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_REQUEST_TIMEOUT_MS = 20000;
let warnedSupabaseNetwork = false;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase no configurada en .env');
}

function timeoutResponse(message: string, status = 504) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), SUPABASE_REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

const supabaseFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUPABASE_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'));

    if (!warnedSupabaseNetwork) {
      warnedSupabaseNetwork = true;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[supabase] No se pudo conectar a ${supabaseUrl}: ${message}. ` +
          'Revisa EXPO_PUBLIC_SUPABASE_URL, DNS o el estado del proyecto.'
      );
    }

    return timeoutResponse(
      timedOut
        ? 'Supabase tardo demasiado en responder. Revisa tu conexion e intenta de nuevo.'
        : 'Supabase no alcanzable desde este dispositivo',
      timedOut ? 504 : 503
    );
  } finally {
    clearTimeout(timeoutId);
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: supabaseFetch,
  },
  auth: {
    persistSession: true,
    storage: {
      getItem: async (key: string) => {
        try {
          if (Platform.OS === 'web') {
            return globalThis.localStorage?.getItem(key) ?? null;
          }
          return await AsyncStorage.getItem(key);
        } catch {
          return null;
        }
      },
      setItem: async (key: string, value: string) => {
        try {
          if (Platform.OS === 'web') {
            globalThis.localStorage?.setItem(key, value);
            return;
          }
          await AsyncStorage.setItem(key, value);
        } catch {
          // Storage failures should not crash auth flows.
        }
      },
      removeItem: async (key: string) => {
        try {
          if (Platform.OS === 'web') {
            globalThis.localStorage?.removeItem(key);
            return;
          }
          await AsyncStorage.removeItem(key);
        } catch {
          // Best-effort cleanup.
        }
      },
    },
  },
});

export type AuthUser = {
  id: string;
  email?: string;
  phone?: string;
};

async function ensureProfileExists(user: {
  id: string;
  user_metadata?: { name?: string };
}): Promise<void> {
  const fallbackName =
    typeof user.user_metadata?.name === 'string' ? user.user_metadata.name.trim() : '';

  const { error } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      name: fallbackName || null,
    },
    { onConflict: 'id' }
  );

  if (error) {
    throw new Error(`No se pudo sincronizar el perfil: ${error.message}`);
  }
}

export async function signInWithPassword(
  email: string,
  password: string
): Promise<{ user: AuthUser; session: any }> {
  const credentials: SignInWithPasswordCredentials = {
    email: email.trim(),
    password,
  };

  const { data, error } = await supabase.auth.signInWithPassword(credentials);

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user) {
    throw new Error('No se pudo iniciar sesión');
  }

  await ensureProfileExists(data.user as any);

  return {
    user: data.user,
    session: data.session,
  };
}

export async function signUp(
  name: string,
  email: string,
  password: string
): Promise<{ user: AuthUser; session: any }> {
  const trimmedName = name.trim();
  const { data, error } = await withTimeout(
    supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
        data: {
          name: trimmedName,
        },
      },
    }),
    'El registro tardo demasiado. Si ya recibiste el correo, confirma tu cuenta e inicia sesion.'
  );

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user) {
    throw new Error('No se pudo registrar');
  }

  if (data.session) {
    await ensureProfileExists({
      id: data.user.id,
      user_metadata: { name: trimmedName || undefined },
    });
  }

  return {
    user: data.user,
    session: data.session,
  };
}

export async function signOut(): Promise<void> {
  try {
    const pushModule = await import('../notifications/expoPushService');
    const cachedToken = await pushModule.getCachedPushToken();
    if (cachedToken) {
      await pushModule.unregisterPushTokenWithBackend(cachedToken);
    }
    await pushModule.clearCachedPushToken();
  } catch {
    // Limpieza best-effort: no debe bloquear el cierre de sesión.
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
  await clearToken();
}

export async function getSession(): Promise<{ user: AuthUser; session: any } | null> {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  if (!data.session || !data.session.user) {
    return null;
  }

  return {
    user: data.session.user,
    session: data.session,
  };
}

export async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;
    if (token) {
      await saveToken(token);
    }
    return token;
  } catch {
    return null;
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: getAuthRedirectUrl('reset-password'),
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function verifyRecoveryCodeAndUpdatePassword(
  email: string,
  code: string,
  password: string
): Promise<void> {
  const { data, error: verifyError } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: 'recovery',
  });

  if (verifyError) {
    throw new Error(verifyError.message);
  }

  if (data.session?.access_token) {
    await saveToken(data.session.access_token);
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });

  if (updateError) {
    throw new Error(updateError.message);
  }
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    throw new Error(error.message);
  }
}
