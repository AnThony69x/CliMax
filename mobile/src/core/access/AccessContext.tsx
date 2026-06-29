import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { API_URL } from '../api/weatherApi';
import { clearToken, getToken, saveToken } from '../auth/authStorage';
import { getAccessToken, supabase } from '../auth/supabaseClient';

export type SubscriptionPlan = 'free' | 'premium' | 'professional';
export type StaffRole = 'admin' | 'operator' | null;

export type AccessState = {
  staffRole: StaffRole;
  plan: SubscriptionPlan;
  professionalSector: string | null;
  entitlements: string[];
};

type AccessContextValue = AccessState & {
  loading: boolean;
  isAdmin: boolean;
  isOperator: boolean;
  refreshAccess: () => Promise<void>;
  hasEntitlement: (feature: string) => boolean;
};

const DEFAULT_ACCESS: AccessState = {
  staffRole: null,
  plan: 'free',
  professionalSector: null,
  entitlements: ['weather.current', 'community.basic', 'alerts.basic', 'weather.history.short'],
};

const AccessContext = createContext<AccessContextValue | null>(null);

export function AccessProvider({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<AccessState>(DEFAULT_ACCESS);
  const [loading, setLoading] = useState(true);

  const refreshAccess = useCallback(async () => {
    try {
      const sessionToken = await getAccessToken();
      const storedToken = sessionToken ? null : await getToken();
      const token = sessionToken ?? storedToken;
      if (!token) {
        setAccess(DEFAULT_ACCESS);
        return;
      }
      if (sessionToken) {
        await saveToken(sessionToken);
      }

      const response = await fetch(`${API_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        if (response.status === 403) {
          const payload = await response.json().catch(() => null);
          const reason = payload?.data?.reason ? `\n\nMotivo: ${payload.data.reason}` : '';
          Alert.alert('Cuenta restringida', `${payload?.message ?? 'Tu cuenta no puede acceder en este momento.'}${reason}`);
        }
        setAccess(DEFAULT_ACCESS);
        return;
      }

      const payload = await response.json();
      const next = payload?.data?.access;
      setAccess({
        staffRole: next?.staff_role ?? null,
        plan: next?.subscription_plan ?? 'free',
        professionalSector: next?.professional_sector ?? null,
        entitlements: Array.isArray(next?.entitlements) ? next.entitlements : DEFAULT_ACCESS.entitlements,
      });
    } catch {
      setAccess(DEFAULT_ACCESS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAccess();
  }, [refreshAccess]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        void saveToken(session.access_token).then(() => refreshAccess());
        return;
      }

      void clearToken();
      setAccess(DEFAULT_ACCESS);
      setLoading(false);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [refreshAccess]);

  const value = useMemo<AccessContextValue>(() => {
    const entitlements = new Set(access.entitlements);
    return {
      ...access,
      loading,
      isAdmin: access.staffRole === 'admin',
      isOperator: access.staffRole === 'admin' || access.staffRole === 'operator',
      refreshAccess,
      hasEntitlement: (feature: string) => entitlements.has(feature),
    };
  }, [access, loading, refreshAccess]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const value = useContext(AccessContext);
  if (!value) {
    throw new Error('useAccess must be used inside AccessProvider');
  }
  return value;
}
