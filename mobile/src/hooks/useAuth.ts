import { useState, useCallback } from 'react';
import { User } from '../types';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'error';

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>('idle');
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState('');

  const signIn = useCallback(async (email: string, password: string) => {
    setStatus('loading');
    setMessage('');

    try {
      const { signInWithPassword } = await import('../core/auth/supabaseClient');
      const { user: supabaseUser, session } = await signInWithPassword(email, password);

      if (!supabaseUser) throw new Error('No se pudo iniciar sesión');

      if (session?.access_token) {
        const { saveToken } = await import('../core/auth/authStorage');
        await saveToken(session.access_token);
      }

      setUser({
        id: supabaseUser.id,
        email: supabaseUser.email,
        phone: supabaseUser.phone,
      });
      setStatus('authenticated');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Error al iniciar sesión');
    }
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    setStatus('loading');
    setMessage('');

    try {
      const { signUp: supabaseSignUp } = await import('../core/auth/supabaseClient');
      const { user: supabaseUser, session } = await supabaseSignUp(name, email, password);

      if (!supabaseUser) throw new Error('No se pudo registrar');

      if (session?.access_token) {
        const { saveToken } = await import('../core/auth/authStorage');
        await saveToken(session.access_token);
      }

      setUser({
        id: supabaseUser.id,
        email: supabaseUser.email,
        phone: supabaseUser.phone,
      });
      setStatus('authenticated');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Error al registrar');
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { signOut: supabaseSignOut } = await import('../core/auth/supabaseClient');
      const { clearToken } = await import('../core/auth/authStorage');
      
      await supabaseSignOut();
      await clearToken();
      
      setUser(null);
      setStatus('unauthenticated');
    } catch (error) {
      console.warn('Error signing out:', error);
    }
  }, []);

  const checkSession = useCallback(async () => {
    setStatus('loading');

    try {
      const { getSession } = await import('../core/auth/supabaseClient');
      const session = await getSession();

      if (!session) {
        setStatus('unauthenticated');
        return;
      }

      setUser({
        id: session.user.id,
        email: session.user.email,
        phone: session.user.phone,
      });
      setStatus('authenticated');
    } catch (error) {
      setStatus('unauthenticated');
    }
  }, []);

  return {
    user,
    status,
    message,
    signIn,
    signUp,
    signOut,
    checkSession,
  };
}