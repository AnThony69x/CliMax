import { createClient, SignInWithPasswordCredentials } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

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
          return await SecureStore.getItemAsync(key);
        } catch {
          return null;
        }
      },
      setItem: async (key: string, value: string) => {
        await SecureStore.setItemAsync(key, value);
      },
      removeItem: async (key: string) => {
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
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        name: name.trim(),
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user) {
    throw new Error('No se pudo registrar');
  }

  return {
    user: data.user,
    session: data.session,
  };
}

export async function signOut(): Promise<void> {
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

  return {
    user: data.session.user,
    session: data.session,
  };
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}