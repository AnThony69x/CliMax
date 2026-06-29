// src/hooks/useIntelligentAlerts.ts
// Hook para consumir las alertas inteligentes de Groq en la app mobile

import { useState, useEffect, useRef } from 'react';
import { useAccess } from '../core/access/AccessContext';
import { API_URL } from '../core/api/weatherApi';
import { getAccessToken } from '../core/auth/supabaseClient';

export interface IntelligentAlert {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  address: string | null;
  risk_level: 'low' | 'medium' | 'high' | 'severe';
  analysis_reason: string;
  recommended_actions: string[];
  user_context: Record<string, any>;
  temperature: number | null;
  weather_code: number | null;
  wind_speed: number | null;
  historical_pattern: Record<string, any>;
  is_notified: boolean;
  is_read: boolean;
  created_at: string;
}

interface AlertSummary {
  total_alerts_48h: number;
  unread_count: number;
  high_risk_count: number;
  by_risk_level: {
    low: number;
    medium: number;
    high: number;
    severe: number;
  };
  average_confidence: number;
  accuracy_feedback: {
    accurate: number;
    false_positive: number;
  };
}

type AnalyzeLocationPayload = {
  latitude: number;
  longitude: number;
  address?: string | null;
};

function normalizeAlert(alert: any): IntelligentAlert {
  return {
    ...alert,
    id: String(alert.id),
    user_id: String(alert.user_id),
    recommended_actions: Array.isArray(alert.recommended_actions) ? alert.recommended_actions : [],
    user_context: alert.user_context ?? {},
    historical_pattern: alert.historical_pattern ?? {},
  };
}

export function useIntelligentAlerts() {
  const { hasEntitlement } = useAccess();
  const canUseBasicAlerts = hasEntitlement('alerts.basic');
  const canUseAdvancedAlerts = hasEntitlement('alerts.advanced');
  const [alerts, setAlerts] = useState<IntelligentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const warnedNetworkRef = useRef(false);

  const getApiUrl = () => {
    return API_URL;
  };

  const reportRequestError = (label: string, err: unknown) => {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    if (message === 'Network request failed') {
      if (!warnedNetworkRef.current) {
        warnedNetworkRef.current = true;
        console.warn(
          `[intelligent-alerts] Backend no alcanzable (${getApiUrl()}). ` +
            'Reinicia Expo si cambiaste EXPO_PUBLIC_API_URL y verifica que el teléfono esté en la misma red.'
        );
      }
      return message;
    }

    console.warn(`[intelligent-alerts] ${label}: ${message}`);
    return message;
  };

  /**
   * Obtener todas las alertas inteligentes del usuario
   */
  const fetchAlerts = async () => {
    setLoading(true);
    setError(null);
    if (!canUseBasicAlerts) {
      setAlerts([]);
      setError('Tu plan actual no incluye alertas inteligentes.');
      setLoading(false);
      return;
    }

    try {
      const token = await getAccessToken();
      if (!token) {
        setError('Usuario no autenticado');
        return;
      }

      const response = await fetch(`${getApiUrl()}/intelligent-alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}`);
      }

      const data = await response.json();
      setAlerts((data.data || []).map(normalizeAlert));
    } catch (err) {
      const message = reportRequestError('Error fetching alerts', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Generar una alerta inteligente para la ubicacion actual del usuario.
   */
  const analyzeLocation = async (payload: AnalyzeLocationPayload) => {
    if (!canUseBasicAlerts) {
      throw new Error('Tu plan actual no incluye alertas inteligentes.');
    }

    const token = await getAccessToken();
    if (!token) {
      throw new Error('Usuario no autenticado');
    }

    const response = await fetch(`${getApiUrl()}/intelligent-alerts/analyze-location`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.message ?? `Error ${response.status}`);
    }

    const newAlert = data?.data ? normalizeAlert(data.data) : undefined;
    if (newAlert) {
      setAlerts((prev) => [newAlert, ...prev.filter((alert) => alert.id !== newAlert.id)]);
    }

    return newAlert ?? null;
  };

  /**
   * Obtener solo alertas sin leer
   */
  const fetchUnreadAlerts = async () => {
    if (!canUseBasicAlerts) return [];

    try {
      const token = await getAccessToken();
      if (!token) return [];

      const response = await fetch(`${getApiUrl()}/intelligent-alerts/unread`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        return (data.data || []).map(normalizeAlert);
      }
      return [];
    } catch (err) {
      reportRequestError('Error fetching unread alerts', err);
      return [];
    }
  };

  /**
   * Obtener solo alertas de alto riesgo
   */
  const fetchHighRiskAlerts = async () => {
    if (!canUseAdvancedAlerts) return [];

    try {
      const token = await getAccessToken();
      if (!token) return [];

      const response = await fetch(`${getApiUrl()}/intelligent-alerts/high-risk`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        return (data.data || []).map(normalizeAlert);
      }
      return [];
    } catch (err) {
      reportRequestError('Error fetching high-risk alerts', err);
      return [];
    }
  };

  /**
   * Obtener resumen de alertas (estadísticas)
   */
  const fetchSummary = async () => {
    if (!canUseAdvancedAlerts) {
      setSummary(null);
      return null;
    }

    try {
      const token = await getAccessToken();
      if (!token) return null;

      const response = await fetch(`${getApiUrl()}/intelligent-alerts/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setSummary(data.data);
        return data.data;
      }
      return null;
    } catch (err) {
      reportRequestError('Error fetching summary', err);
      return null;
    }
  };

  /**
   * Marcar una alerta como leída (se hace automáticamente al llamar show)
   */
  const markAsRead = async (alertId: string) => {
    if (!canUseBasicAlerts) return;

    try {
      const token = await getAccessToken();
      if (!token) return;

      await fetch(`${getApiUrl()}/intelligent-alerts/${alertId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Actualizar estado local
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId ? { ...a, is_read: true } : a
        )
      );
    } catch (err) {
      reportRequestError('Error marking alert as read', err);
    }
  };

  /**
   * Proporcionar feedback sobre precisión de alerta
   */
  const provideFeedback = async (
    alertId: string,
    feedback: 'accurate' | 'false_positive'
  ) => {
    if (!canUseAdvancedAlerts) return;

    try {
      const token = await getAccessToken();
      if (!token) return;

      const response = await fetch(
        `${getApiUrl()}/intelligent-alerts/${alertId}/feedback`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ feedback }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        // Actualizar estado local
        const updatedAlert = normalizeAlert(data.data);
        setAlerts((prev) =>
          prev.map((a) =>
            a.id === alertId ? { ...a, ...updatedAlert } : a
          )
        );
      }
    } catch (err) {
      reportRequestError('Error providing feedback', err);
    }
  };

  /**
   * Obtener historial de alertas
   */
  const fetchHistory = async (days: number = 7) => {
    if (!canUseAdvancedAlerts) return [];

    try {
      const token = await getAccessToken();
      if (!token) return [];

      const response = await fetch(
        `${getApiUrl()}/intelligent-alerts/history?days=${days}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        const data = await response.json();
        return (data.data || []).map(normalizeAlert);
      }
      return [];
    } catch (err) {
      reportRequestError('Error fetching history', err);
      return [];
    }
  };

  // Auto-fetch al montar y establecer polling
  useEffect(() => {
    void fetchAlerts();
    if (canUseAdvancedAlerts) {
      void fetchSummary();
    }

    // Actualizar cada 5 minutos
    const interval = setInterval(() => {
      void fetchAlerts();
      if (canUseAdvancedAlerts) {
        void fetchSummary();
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [canUseAdvancedAlerts, canUseBasicAlerts]);

  return {
    alerts,
    summary,
    loading,
    error,
    fetchAlerts,
    fetchUnreadAlerts,
    fetchHighRiskAlerts,
    fetchSummary,
    fetchHistory,
    analyzeLocation,
    markAsRead,
    provideFeedback,
    canUseBasicAlerts,
    canUseAdvancedAlerts,
  };
}
