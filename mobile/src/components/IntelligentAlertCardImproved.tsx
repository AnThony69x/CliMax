// src/components/IntelligentAlertCardImproved.tsx
// Componente mejorado para mostrar alertas inteligentes con acciones dinámicas

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  Alert as NativeAlert,
  SafeAreaView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { IntelligentAlert } from '../hooks/useIntelligentAlerts';

interface Props {
  alert: IntelligentAlert;
  onMarkAsRead: (id: string) => void;
  onProvideFeedback: (id: string, feedback: 'accurate' | 'false_positive') => void;
}

const RISK_CONFIG = {
  low: {
    bg: '#DCFCE7',
    border: '#22C55E',
    icon: 'checkmark-circle',
    emoji: '🟢',
    title: 'Bajo Riesgo',
  },
  medium: {
    bg: '#FEF3C7',
    border: '#F59E0B',
    icon: 'alert-circle',
    emoji: '🟡',
    title: 'Riesgo Medio',
  },
  high: {
    bg: '#FED7AA',
    border: '#F97316',
    icon: 'warning',
    emoji: '🟠',
    title: 'Alto Riesgo',
  },
  severe: {
    bg: '#FEE2E2',
    border: '#EF4444',
    icon: 'alert-circle',
    emoji: '🔴',
    title: 'Riesgo Severo',
  },
};

// Mapeo de acciones a iconos
const ACTION_ICONS: Record<string, { icon: string; color: string }> = {
  'refugio': { icon: 'home', color: '#3B82F6' },
  'transporte': { icon: 'car', color: '#06B6D4' },
  'posesiones': { icon: 'package-variant', color: '#F59E0B' },
  'conducción': { icon: 'steering', color: '#EF4444' },
  'ropa': { icon: 'tshirt-v', color: '#8B5CF6' },
  'actividades': { icon: 'dumbbell', color: '#10B981' },
  'hidratación': { icon: 'water', color: '#06B6D4' },
  'vigilancia': { icon: 'eye', color: '#F59E0B' },
  'suspender': { icon: 'pause-circle', color: '#EF4444' },
  'evitar': { icon: 'close-circle', color: '#EF4444' },
  'informar': { icon: 'phone', color: '#3B82F6' },
  'asegurar': { icon: 'lock', color: '#8B5CF6' },
  'proteger': { icon: 'shield', color: '#10B981' },
  'revisar': { icon: 'clipboard-check', color: '#06B6D4' },
};

function getActionIcon(action: string): { icon: string; color: string } {
  const lowerAction = action.toLowerCase();
  
  // Buscar palabras clave en la acción
  for (const [keyword, iconConfig] of Object.entries(ACTION_ICONS)) {
    if (lowerAction.includes(keyword)) {
      return iconConfig;
    }
  }
  
  // Icono por defecto
  return { icon: 'lightbulb', color: '#F59E0B' };
}

function getWeatherIcon(weatherCode: number | null): string {
  if (!weatherCode) return 'cloud';
  if (weatherCode === 0 || weatherCode === 1) return 'white-balance-sunny';
  if (weatherCode === 2) return 'cloud-percent';
  if (weatherCode === 3) return 'cloud';
  if (weatherCode >= 45 && weatherCode <= 48) return 'weather-fog';
  if ((weatherCode >= 61 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)) return 'cloud-rain';
  if (weatherCode >= 71 && weatherCode <= 77) return 'snowflake';
  if (weatherCode >= 95 && weatherCode <= 99) return 'weather-lightning';
  return 'cloud-question';
}

export const IntelligentAlertCardImproved: React.FC<Props> = ({
  alert,
  onMarkAsRead,
  onProvideFeedback,
}) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [feedbackProvided, setFeedbackProvided] = useState<'accurate' | 'false_positive' | null>(null);

  const config = RISK_CONFIG[alert.risk_level];
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
      {/* TARJETA COMPACTA */}
      <Pressable
        style={[
          styles.card,
          {
            backgroundColor: colors.bg,
            borderLeftColor: config.border,
            opacity: alert.is_read ? 0.6 : 1,
          },
        ]}
        onPress={handlePress}
      >
        {/* Header con emoji, nivel de riesgo y hora */}
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <Text style={styles.emojiLarge}>{config.emoji}</Text>
            <View style={styles.headerInfo}>
              <Text style={[styles.riskLevelBold, { color: config.border }]}>
                {config.title}
              </Text>
              <Text style={styles.locationCompact} numberOfLines={1}>
                📍 {alert.address || `${alert.latitude.toFixed(2)}, ${alert.longitude.toFixed(2)}`}
              </Text>
            </View>
          </View>
          <View style={styles.timeColumn}>
            <Text style={styles.timeText}>{timeAgo}</Text>
            {!alert.is_read && <View style={styles.newDot} />}
          </View>
        </View>

        {/* Resumen de análisis */}
        <Text style={styles.reasonCompact} numberOfLines={2}>
          {alert.analysis_reason}
        </Text>

        {/* Previsualización de acciones */}
        {alert.recommended_actions.length > 0 && (
          <View style={styles.actionsCompactContainer}>
            {alert.recommended_actions.slice(0, 3).map((action, idx) => {
              const { icon, color } = getActionIcon(action);
              return (
                <View key={idx} style={styles.actionCompactBadge}>
                  <MaterialCommunityIcons name={icon as any} size={14} color={color} />
                  <Text style={styles.actionCompactText} numberOfLines={1}>
                    {action.split(' ').slice(0, 2).join(' ')}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Botón expandir */}
        <Pressable style={styles.expandArrow} onPress={handlePress}>
          <MaterialCommunityIcons name="chevron-right" size={24} color={config.border} />
        </Pressable>
      </Pressable>

      {/* MODAL DETALLADO */}
      <Modal
        visible={detailsOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        hardwareAccelerated
        onRequestClose={() => setDetailsOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <SafeAreaView style={styles.modalContent}>
            {/* Header del modal */}
            <View style={[styles.modalHeader, { backgroundColor: config.border }]}>
              <View style={styles.modalHeaderLeft}>
                <Text style={styles.modalHeaderEmoji}>{config.emoji}</Text>
                <View>
                  <Text style={styles.modalTitle}>{config.title}</Text>
                  <Text style={styles.modalSubtitle}>{timeAgo}</Text>
                </View>
              </View>
              <Pressable onPress={() => setDetailsOpen(false)}>
                <MaterialCommunityIcons name="close" size={24} color="white" />
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Ubicación */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <MaterialCommunityIcons name="map-marker" size={20} color="#3B82F6" />
                  <Text style={styles.sectionTitle}>Ubicación</Text>
                </View>
                <Text style={styles.sectionContent}>
                  {alert.address || `${alert.latitude.toFixed(4)}, ${alert.longitude.toFixed(4)}`}
                </Text>
              </View>

              {/* Condiciones Actuales */}
              {alert.temperature !== null && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <MaterialCommunityIcons
                      name={getWeatherIcon(alert.weather_code)}
                      size={20}
                      color="#F59E0B"
                    />
                    <Text style={styles.sectionTitle}>Condiciones Actuales</Text>
                  </View>
                  <View style={styles.conditionsGrid}>
                    <View style={styles.conditionBox}>
                      <MaterialCommunityIcons name="thermometer" size={18} color="#EF4444" />
                      <Text style={styles.conditionLabel}>Temperatura</Text>
                      <Text style={styles.conditionValue}>{alert.temperature}°C</Text>
                    </View>
                    <View style={styles.conditionBox}>
                      <MaterialCommunityIcons name="wind" size={18} color="#06B6D4" />
                      <Text style={styles.conditionLabel}>Viento</Text>
                      <Text style={styles.conditionValue}>{alert.wind_speed} km/h</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Análisis IA */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <MaterialCommunityIcons name="brain" size={20} color="#8B5CF6" />
                  <Text style={styles.sectionTitle}>Análisis de IA</Text>
                </View>
                <View
                  style={[
                    styles.analysisBox,
                    { borderLeftColor: config.border },
                  ]}
                >
                  <Text style={styles.analysisText}>{alert.analysis_reason}</Text>
                </View>
              </View>

              {/* ACCIONES RECOMENDADAS - MEJORADO */}
              {alert.recommended_actions.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <MaterialCommunityIcons name="checklist" size={20} color="#10B981" />
                    <Text style={styles.sectionTitle}>Acciones Recomendadas</Text>
                  </View>
                  <View style={styles.actionsContainer}>
                    {alert.recommended_actions.map((action, idx) => {
                      const { icon, color } = getActionIcon(action);
                      return (
                        <View key={idx} style={styles.actionFullItem}>
                          <View style={[styles.actionIconCircle, { backgroundColor: color + '20' }]}>
                            <MaterialCommunityIcons
                              name={icon as any}
                              size={20}
                              color={color}
                            />
                          </View>
                          <Text style={styles.actionFullText}>{action}</Text>
                          <MaterialCommunityIcons name="check-circle" size={18} color="#10B981" />
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Patrón Histórico */}
              {alert.historical_pattern && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <MaterialCommunityIcons name="chart-line" size={20} color="#F59E0B" />
                    <Text style={styles.sectionTitle}>Patrón Histórico (48h)</Text>
                  </View>
                  <View style={styles.patternGrid}>
                    {alert.historical_pattern.temp_trend && (
                      <View style={styles.patternItem}>
                        <Text style={styles.patternLabel}>Tendencia Temp</Text>
                        <View style={styles.patternValue}>
                          <MaterialCommunityIcons
                            name={
                              alert.historical_pattern.temp_trend === 'increasing'
                                ? 'trending-up'
                                : alert.historical_pattern.temp_trend === 'decreasing'
                                ? 'trending-down'
                                : 'minus'
                            }
                            size={16}
                            color="#666"
                          />
                          <Text style={styles.patternValueText}>
                            {alert.historical_pattern.temp_trend}
                          </Text>
                        </View>
                      </View>
                    )}
                    {alert.historical_pattern.extreme_weather_events !== undefined && (
                      <View style={styles.patternItem}>
                        <Text style={styles.patternLabel}>Eventos Extremos</Text>
                        <Text style={styles.patternValueText}>
                          {alert.historical_pattern.extreme_weather_events}
                        </Text>
                      </View>
                    )}
                    {alert.historical_pattern.max_wind_speed !== undefined && (
                      <View style={styles.patternItem}>
                        <Text style={styles.patternLabel}>Viento Máx</Text>
                        <Text style={styles.patternValueText}>
                          {alert.historical_pattern.max_wind_speed} km/h
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Feedback */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <MaterialCommunityIcons name="comment-question" size={20} color="#06B6D4" />
                  <Text style={styles.sectionTitle}>Tu Feedback</Text>
                </View>
                <Text style={styles.feedbackQuestion}>¿Fue precisa esta alerta?</Text>
                <View style={styles.feedbackButtonsRow}>
                  <Pressable
                    style={[
                      styles.feedbackBtn,
                      feedbackProvided === 'accurate' && styles.feedbackBtnAccurate,
                    ]}
                    onPress={() => handleFeedback('accurate')}
                  >
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={18}
                      color={feedbackProvided === 'accurate' ? '#10B981' : '#999'}
                    />
                    <Text
                      style={[
                        styles.feedbackBtnText,
                        feedbackProvided === 'accurate' && styles.feedbackBtnTextActive,
                      ]}
                    >
                      Sí, precisa
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.feedbackBtn,
                      feedbackProvided === 'false_positive' && styles.feedbackBtnFalse,
                    ]}
                    onPress={() => handleFeedback('false_positive')}
                  >
                    <MaterialCommunityIcons
                      name="alert-circle"
                      size={18}
                      color={feedbackProvided === 'false_positive' ? '#EF4444' : '#999'}
                    />
                    <Text
                      style={[
                        styles.feedbackBtnText,
                        feedbackProvided === 'false_positive' && styles.feedbackBtnTextActive,
                      ]}
                    >
                      Falsa alarma
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.spacer} />
            </ScrollView>

            {/* Footer */}
            <Pressable style={styles.closeButton} onPress={() => setDetailsOpen(false)}>
              <Text style={styles.closeButtonText}>Cerrar Detalles</Text>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
};

function getTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Ahora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days}d`;
}

const colors = {
  bg: '#F9FAFB',
};

const styles = StyleSheet.create({
  // CARD COMPACTA
  card: {
    marginHorizontal: 12,
    marginVertical: 8,
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
    backgroundColor: colors.bg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'flex-start',
  },
  emojiLarge: {
    fontSize: 28,
    marginRight: 10,
  },
  headerInfo: {
    flex: 1,
  },
  riskLevelBold: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  locationCompact: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  timeColumn: {
    alignItems: 'flex-end',
  },
  timeText: {
    fontSize: 11,
    color: '#999',
  },
  newDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
    marginTop: 4,
  },
  reasonCompact: {
    fontSize: 12,
    lineHeight: 16,
    color: '#555',
    marginBottom: 8,
  },
  actionsCompactContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  actionCompactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  actionCompactText: {
    fontSize: 10,
    color: '#555',
  },
  expandArrow: {
    alignSelf: 'flex-end',
    padding: 4,
  },

  // MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    paddingTop: 24,
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modalHeaderEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  modalSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  modalScroll: {
    flex: 1,
    paddingHorizontal: 16,
  },
  modalScrollContent: {
    paddingBottom: 12,
  },

  // SECCIONES
  section: {
    marginTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  sectionContent: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },

  // CONDICIONES
  conditionsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  conditionBox: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  conditionLabel: {
    fontSize: 10,
    color: '#999',
    marginTop: 6,
    marginBottom: 4,
  },
  conditionValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },

  // ANÁLISIS
  analysisBox: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 10,
    borderLeftWidth: 3,
  },
  analysisText: {
    fontSize: 12,
    lineHeight: 17,
    color: '#555',
  },

  // ACCIONES MEJORADAS
  actionsContainer: {
    gap: 10,
  },
  actionFullItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    gap: 12,
  },
  actionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionFullText: {
    flex: 1,
    fontSize: 12,
    color: '#333',
    lineHeight: 16,
    fontWeight: '500',
  },

  // PATRÓN
  patternGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  patternItem: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    padding: 10,
    borderRadius: 8,
  },
  patternLabel: {
    fontSize: 10,
    color: '#999',
    marginBottom: 6,
  },
  patternValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  patternValueText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },

  // FEEDBACK
  feedbackQuestion: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  feedbackButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  feedbackBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    backgroundColor: '#fafafa',
    gap: 8,
  },
  feedbackBtnAccurate: {
    borderColor: '#10B981',
    backgroundColor: '#f0fdf4',
  },
  feedbackBtnFalse: {
    borderColor: '#EF4444',
    backgroundColor: '#fef2f2',
  },
  feedbackBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  feedbackBtnTextActive: {
    color: '#333',
  },

  // FOOTER
  closeButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#f9f9f9',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },

  spacer: {
    height: 20,
  },
});
