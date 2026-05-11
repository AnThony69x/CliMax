import { createClient, SignInWithPasswordCredentials } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase no configurada en .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storage: {
      getItem: async (key: string) => {
        try {
          if (Platform.OS === 'web') {
            return globalThis.localStorage?.getItem(key) ?? null;
          }
          return await SecureStore.getItemAsync(key);
        } catch {
          return null;
        }
      },
      setItem: async (key: string, value: string) => {
        if (Platform.OS === 'web') {
          globalThis.localStorage?.setItem(key, value);
          return;
        }
        await SecureStore.setItemAsync(key, value);
      },
      removeItem: async (key: string) => {
        if (Platform.OS === 'web') {
          globalThis.localStorage?.removeItem(key);
          return;
        }
        await SecureStore.deleteItemAsync(key);
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
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        name: trimmedName,
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user) {
    throw new Error('No se pudo registrar');
  }

  await ensureProfileExists({
    id: data.user.id,
    user_metadata: { name: trimmedName || undefined },
  });

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
}

export async function getSession(): Promise<{ user: AuthUser; session: any } | null> {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  if (!data.session || !data.session.user) {
    return null;
  }

  await ensureProfileExists(data.session.user as any);

  return {
    user: data.session.user,
    session: data.session,
  };
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}