import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  refreshAccess: (options?: { force?: boolean }) => Promise<boolean>;
  hasEntitlement: (feature: string) => boolean;
};

const DEFAULT_ACCESS: AccessState = {
  staffRole: null,
  plan: 'free',
  professionalSector: null,
  entitlements: ['weather.current', 'community.basic', 'alerts.basic', 'weather.history.short'],
};

const AccessContext = createContext<AccessContextValue | null>(null);
const RECENT_ACCESS_REFRESH_MS = 5000;

export function AccessProvider({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<AccessState>(DEFAULT_ACCESS);
  const [loading, setLoading] = useState(true);
  const lastTokenRef = useRef<string | null>(null);
  const lastRefreshAtRef = useRef(0);
  const inFlightRefreshRef = useRef<Promise<boolean> | null>(null);

  const refreshAccess = useCallback(async (options: { force?: boolean } = {}) => {
    const runRefresh = async () => {
      const sessionToken = await getAccessToken();
      const storedToken = sessionToken ? null : await getToken();
      const token = sessionToken ?? storedToken;
      if (!token) {
        lastTokenRef.current = null;
        lastRefreshAtRef.current = Date.now();
        setAccess(DEFAULT_ACCESS);
        setLoading(false);
        return false;
      }

      const isSameToken = lastTokenRef.current === token;
      const isRecent = Date.now() - lastRefreshAtRef.current < RECENT_ACCESS_REFRESH_MS;
      if (!options.force && isSameToken && isRecent) return true;

      if (sessionToken) {
        await saveToken(sessionToken);
      }

      const response = await fetch(`${API_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        let payload: unknown = null;
        if (response.status === 403) {
          payload = await response.json().catch(() => null);
          const reason = getAccountBlockReason(payload);
          Alert.alert('Cuenta restringida', `${getAccountBlockMessage(payload)}${reason ? `\n\nMotivo: ${reason}` : ''}`);
        }
        if (isAccountBlockCode(getPayloadCode(payload))) {
          await supabase.auth.signOut().catch(() => null);
          await clearToken();
        }
        lastTokenRef.current = null;
        lastRefreshAtRef.current = Date.now();
        setAccess(DEFAULT_ACCESS);
        return false;
      }

      const payload = await response.json();
      const next = payload?.data?.access;
      setAccess({
        staffRole: next?.staff_role ?? null,
        plan: next?.subscription_plan ?? 'free',
        professionalSector: next?.professional_sector ?? null,
        entitlements: Array.isArray(next?.entitlements) ? next.entitlements : DEFAULT_ACCESS.entitlements,
      });
      lastTokenRef.current = token;
      lastRefreshAtRef.current = Date.now();
      return true;
    };

    if (!options.force && inFlightRefreshRef.current) {
      return inFlightRefreshRef.current;
    }

    const refreshPromise = runRefresh()
      .catch(() => {
        setAccess(DEFAULT_ACCESS);
        return false;
      })
      .finally(() => {
        setLoading(false);
        inFlightRefreshRef.current = null;
      });

    inFlightRefreshRef.current = refreshPromise;
    return refreshPromise;
  }, []);

  const resetAccess = useCallback(() => {
    lastTokenRef.current = null;
    lastRefreshAtRef.current = 0;
    inFlightRefreshRef.current = null;
    setAccess(DEFAULT_ACCESS);
    setLoading(false);
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
      resetAccess();
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [refreshAccess, resetAccess]);

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

function isAccountBlockCode(code: unknown) {
  return code === 'account_suspended' || code === 'account_banned' || code === 'account_deleted';
}

function getPayloadCode(payload: unknown) {
  return isRecord(payload) ? payload.code : null;
}

function getAccountBlockMessage(payload: unknown) {
  return isRecord(payload) && typeof payload.message === 'string'
    ? payload.message
    : 'Tu cuenta no puede acceder en este momento.';
}

function getAccountBlockReason(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.data) || typeof payload.data.reason !== 'string') {
    return '';
  }

  return payload.data.reason;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function useAccess() {
  const value = useContext(AccessContext);
  if (!value) {
    throw new Error('useAccess must be used inside AccessProvider');
  }
  return value;
}
