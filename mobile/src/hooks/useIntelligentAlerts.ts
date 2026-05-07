// src/hooks/useIntelligentAlerts.ts
// Hook para consumir las alertas inteligentes de Groq en la app mobile

import { useState, useEffect } from 'react';
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

export function useIntelligentAlerts() {
  const [alerts, setAlerts] = useState<IntelligentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getApiUrl = () => {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!apiUrl) throw new Error('API URL not configured');
    return apiUrl;
  };

  /**
   * Obtener todas las alertas inteligentes del usuario
   */
  const fetchAlerts = async () => {
    setLoading(true);
    setError(null);
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
      setAlerts(data.data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setError(message);
      console.error('Error fetching alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Obtener solo alertas sin leer
   */
  const fetchUnreadAlerts = async () => {
    try {
      const token = await getAccessToken();
      if (!token) return [];

      const response = await fetch(`${getApiUrl()}/intelligent-alerts/unread`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        return data.data || [];
      }
      return [];
    } catch (err) {
      console.error('Error fetching unread alerts:', err);
      return [];
    }
  };

  /**
   * Obtener solo alertas de alto riesgo
   */
  const fetchHighRiskAlerts = async () => {
    try {
      const token = await getAccessToken();
      if (!token) return [];

      const response = await fetch(`${getApiUrl()}/intelligent-alerts/high-risk`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        return data.data || [];
      }
      return [];
    } catch (err) {
      console.error('Error fetching high-risk alerts:', err);
      return [];
    }
  };

  /**
   * Obtener resumen de alertas (estadísticas)
   */
  const fetchSummary = async () => {
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
      console.error('Error fetching summary:', err);
      return null;
    }
  };

  /**
   * Marcar una alerta como leída (se hace automáticamente al llamar show)
   */
  const markAsRead = async (alertId: string) => {
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
      console.error('Error marking alert as read:', err);
    }
  };

  /**
   * Proporcionar feedback sobre precisión de alerta
   */
  const provideFeedback = async (
    alertId: string,
    feedback: 'accurate' | 'false_positive'
  ) => {
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
        setAlerts((prev) =>
          prev.map((a) =>
            a.id === alertId ? { ...a, ...data.data } : a
          )
        );
      }
    } catch (err) {
      console.error('Error providing feedback:', err);
    }
  };

  /**
   * Obtener historial de alertas
   */
  const fetchHistory = async (days: number = 7) => {
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
        return data.data || [];
      }
      return [];
    } catch (err) {
      console.error('Error fetching history:', err);
      return [];
    }
  };

  // Auto-fetch al montar y establecer polling
  useEffect(() => {
    void fetchAlerts();
    void fetchSummary();

    // Actualizar cada 5 minutos
    const interval = setInterval(() => {
      void fetchAlerts();
      void fetchSummary();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

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
    markAsRead,
    provideFeedback,
  };
}
