// src/components/IntelligentAlertCard.tsx
// Componente para mostrar una alerta inteligente

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  Alert as NativeAlert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { IntelligentAlert } from '../hooks/useIntelligentAlerts';

interface Props {
  alert: IntelligentAlert;
  onMarkAsRead: (id: string) => void;
  onProvideFeedback: (id: string, feedback: 'accurate' | 'false_positive') => void;
}

const RISK_COLORS: Record<string, { bg: string; border: string; icon: string; emoji: string }> = {
  low: { bg: '#DCFCE7', border: '#22C55E', icon: 'checkmark-circle', emoji: '🟢' },
  medium: { bg: '#FEF3C7', border: '#F59E0B', icon: 'alert-circle', emoji: '🟡' },
  high: { bg: '#FED7AA', border: '#F97316', icon: 'warning', emoji: '🟠' },
  severe: { bg: '#FEE2E2', border: '#EF4444', icon: 'alert-circle', emoji: '🔴' },
};

export const IntelligentAlertCard: React.FC<Props> = ({
  alert,
  onMarkAsRead,
  onProvideFeedback,
}) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [feedbackProvided, setFeedbackProvided] = useState<'accurate' | 'false_positive' | null>(null);

  const colors = RISK_COLORS[alert.risk_level];
  const timeAgo = getTimeAgo(new Date(alert.created_at));

  const handlePress = () => {
    if (!alert.is_read) {
      onMarkAsRead(alert.id);
    }
    setDetailsOpen(true);
  };

  const handleFeedback = (type: 'accurate' | 'false_positive') => {
    onProvideFeedback(alert.id, type);
    setFeedbackProvided(type);

    const message =
      type === 'accurate'
        ? 'Gracias, tu feedback ayuda a mejorar el modelo'
        : 'Feedback registrado, mejoraremos la precisión';

    NativeAlert.alert('Feedback', message, [{ text: 'OK' }]);
  };

  return (
    <>
      <Pressable
        style={[
          styles.card,
          {
            backgroundColor: colors.bg,
            borderLeftColor: colors.border,
            opacity: alert.is_read ? 0.7 : 1,
          },
        ]}
        onPress={handlePress}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.emoji}>{colors.emoji}</Text>
            <View style={styles.titleColumn}>
              <Text style={styles.riskLevel}>
                {alert.risk_level.toUpperCase()}
              </Text>
              <Text style={styles.location} numberOfLines={1}>
                📍 {alert.address || `${alert.latitude.toFixed(2)}, ${alert.longitude.toFixed(2)}`}
              </Text>
            </View>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{timeAgo}</Text>
          </View>
        </View>

        {!alert.is_read && (
          <View style={styles.unreadIndicator}>
            <View style={styles.unreadDot} />
            <Text style={styles.unreadText}>Nueva</Text>
          </View>
        )}

        <Text style={styles.reason} numberOfLines={3}>
          {alert.analysis_reason}
        </Text>

        {alert.recommended_actions.length > 0 && (
          <View style={styles.actionsPreview}>
            <Text style={styles.actionLabel}>Acciones recomendadas:</Text>
            {alert.recommended_actions.slice(0, 2).map((action, idx) => (
              <Text key={idx} style={styles.actionItem}>
                • {action}
              </Text>
            ))}
            {alert.recommended_actions.length > 2 && (
              <Text style={styles.moreActions}>
                + {alert.recommended_actions.length - 2} más
              </Text>
            )}
          </View>
        )}

        <Pressable
          style={styles.expandButton}
          onPress={handlePress}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.border} />
        </Pressable>
      </Pressable>

      <Modal
        visible={detailsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailsOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={[styles.modalHeader, { backgroundColor: colors.border }]}>
              <Text style={styles.modalTitle}>
                {colors.emoji} Alerta {alert.risk_level.toUpperCase()}
              </Text>
              <Pressable onPress={() => setDetailsOpen(false)}>
                <Ionicons name="close" size={24} color="white" />
              </Pressable>
            </View>

            <ScrollView style={styles.modalScroll}>
              {/* Ubicación */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📍 Ubicación</Text>
                <Text style={styles.sectionContent}>
                  {alert.address || `${alert.latitude.toFixed(4)}, ${alert.longitude.toFixed(4)}`}
                </Text>
              </View>

              {/* Condiciones Actuales */}
              {alert.temperature !== null && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>🌡️ Condiciones Actuales</Text>
                  <View style={styles.conditionRow}>
                    <View style={styles.conditionItem}>
                      <Text style={styles.conditionLabel}>Temperatura</Text>
                      <Text style={styles.conditionValue}>{alert.temperature}°C</Text>
                    </View>
                    <View style={styles.conditionItem}>
                      <Text style={styles.conditionLabel}>Viento</Text>
                      <Text style={styles.conditionValue}>{alert.wind_speed} km/h</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Análisis Detallado */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🔬 Análisis IA</Text>
                <View style={styles.analysisBox}>
                  <Text style={styles.analysisText}>{alert.analysis_reason}</Text>
                </View>
              </View>

              {/* Acciones Recomendadas */}
              {alert.recommended_actions.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>✅ Acciones Recomendadas</Text>
                  {alert.recommended_actions.map((action, idx) => (
                    <View key={idx} style={styles.actionItemFull}>
                      <View style={styles.actionBullet} />
                      <Text style={styles.actionFullText}>{action}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Patrón Histórico */}
              {alert.historical_pattern && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>📊 Patrón Histórico (48h)</Text>
                  <View style={styles.patternBox}>
                    {alert.historical_pattern.temp_trend && (
                      <Text style={styles.patternText}>
                        Tendencia: {alert.historical_pattern.temp_trend === 'increasing' ? '📈' : alert.historical_pattern.temp_trend === 'decreasing' ? '📉' : '➡️'} {alert.historical_pattern.temp_trend}
                      </Text>
                    )}
                    {alert.historical_pattern.extreme_weather_events !== undefined && (
                      <Text style={styles.patternText}>
                        Eventos extremos: {alert.historical_pattern.extreme_weather_events}
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {/* Feedback */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>💬 Tu Feedback</Text>
                <Text style={styles.feedbackSubtitle}>
                  ¿Fue precisa esta alerta?
                </Text>
                <View style={styles.feedbackRow}>
                  <Pressable
                    style={[
                      styles.feedbackButton,
                      feedbackProvided === 'accurate' && styles.feedbackButtonActive,
                    ]}
                    onPress={() => handleFeedback('accurate')}
                  >
                    <Text style={styles.feedbackButtonText}>✅ Precisa</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.feedbackButton,
                      feedbackProvided === 'false_positive' && styles.feedbackButtonActive,
                    ]}
                    onPress={() => handleFeedback('false_positive')}
                  >
                    <Text style={styles.feedbackButtonText}>❌ Falsa alarma</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.spacer} />
            </ScrollView>

            <Pressable
              style={styles.closeButton}
              onPress={() => setDetailsOpen(false)}
            >
              <Text style={styles.closeButtonText}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
};

function getTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'ahora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

const styles = StyleSheet.create({
  card: {
    margin: 12,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 5,
    backgroundColor: '#f5f5f5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'flex-start',
  },
  emoji: {
    fontSize: 24,
    marginRight: 12,
  },
  titleColumn: {
    flex: 1,
  },
  riskLevel: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  location: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  badge: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    color: '#666',
  },
  unreadIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    marginRight: 6,
  },
  unreadText: {
    fontSize: 11,
    color: '#EF4444',
    fontWeight: '600',
  },
  reason: {
    fontSize: 13,
    lineHeight: 18,
    color: '#333',
    marginBottom: 12,
  },
  actionsPreview: {
    backgroundColor: 'rgba(0,0,0,0.03)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    color: '#333',
  },
  actionItem: {
    fontSize: 12,
    color: '#555',
    marginBottom: 4,
  },
  moreActions: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
    fontStyle: 'italic',
  },
  expandButton: {
    alignSelf: 'flex-end',
    padding: 4,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  modalScroll: {
    flex: 1,
    paddingHorizontal: 16,
  },

  section: {
    marginTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    color: '#333',
  },
  sectionContent: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },

  conditionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  conditionItem: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
  },
  conditionLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 4,
  },
  conditionValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },

  analysisBox: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
  },
  analysisText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#555',
  },

  actionItemFull: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  actionBullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    marginTop: 6,
    marginRight: 10,
  },
  actionFullText: {
    flex: 1,
    fontSize: 13,
    color: '#555',
    lineHeight: 16,
  },

  patternBox: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
  },
  patternText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },

  feedbackSubtitle: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },
  feedbackRow: {
    flexDirection: 'row',
    gap: 12,
  },
  feedbackButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fafafa',
  },
  feedbackButtonActive: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  feedbackButtonText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    color: '#333',
  },

  spacer: {
    height: 20,
  },

  closeButton: {
    marginTop: 12,
    marginBottom: 12,
    marginHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
});
