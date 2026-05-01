import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Alert } from '../../types';

const GLASS_BG     = 'rgba(255,255,255,0.12)';
const GLASS_BORDER = 'rgba(255,255,255,0.18)';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const SEVERITY_CONFIG: Record<string, {
  label: string;
  color: string;
  iconName: IoniconName;
}> = {
  critical: { label: 'CRÍTICO',  color: '#ffb4ab', iconName: 'thunderstorm-outline' },
  warning:  { label: 'MODERADO', color: '#ffb95a', iconName: 'rainy-outline'        },
  info:     { label: 'AVISO',    color: '#90cdfd', iconName: 'partly-sunny-outline' },
};

const SAFETY_TIPS: { iconName: IoniconName; text: string }[] = [
  { iconName: 'home-outline',        text: 'Permanezca bajo techo' },
  { iconName: 'flashlight-outline',  text: 'Prepare linternas'     },
  { iconName: 'flash-outline',       text: 'Desconecte aparatos'   },
  { iconName: 'car-outline',         text: 'Evite desplazamientos' },
];

export default function AlertsScreen() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAlerts(); }, []);

  const loadAlerts = async () => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      if (!apiUrl) { setAlerts([]); return; }
      const response = await fetch(`${apiUrl}/alerts`);
      if (response.ok) {
        const data = await response.json();
        setAlerts(data.data || []);
      }
    } catch (error) {
      console.warn('Error loading alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (alertId: string) => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      if (!apiUrl) return;
      await fetch(`${apiUrl}/alerts/${alertId}/read`, { method: 'PATCH' });
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, is_read: true } : a)));
    } catch (error) {
      console.warn('Error marking alert as read:', error);
    }
  };

  const handlePress = (alert: Alert) => {
    if (!alert.is_read) markAsRead(alert.id);
    router.push(`/alert/${alert.id}` as any);
  };

  const unreadCount    = alerts.filter((a) => !a.is_read).length;
  const primaryAlert   = alerts[0] ?? null;
  const secondaryAlerts = alerts.slice(1);

  const getSeverity = (severity: Alert['severity']) =>
    SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.info;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <ActivityIndicator size="large" color="#90cdfd" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Encabezado ── */}
        <View style={styles.header}>
          <Text style={styles.title}>Alertas Meteorológicas</Text>
          <Text style={styles.subtitle}>
            {unreadCount > 0
              ? `${unreadCount} alerta${unreadCount > 1 ? 's' : ''} sin leer`
              : 'Sin alertas pendientes'}
          </Text>
        </View>

        {alerts.length === 0 ? (
          /* ── Estado vacío ── */
          <View style={styles.emptyCard}>
            <Ionicons name="notifications-outline" size={48} color="rgba(255,255,255,0.4)" />
            <Text style={styles.emptyTitle}>Sin alertas activas</Text>
            <Text style={styles.emptyText}>
              Te notificaremos cuando haya alertas climáticas en tu zona.
            </Text>
          </View>
        ) : (
          <>
            {/* ── Alerta principal ── */}
            {primaryAlert && (
              <Pressable
                style={({ pressed }) => [styles.primaryCard, pressed && { opacity: 0.88 }]}
                onPress={() => handlePress(primaryAlert)}
              >
                {/* Badge de severidad */}
                <View style={[
                  styles.severityBadge,
                  { borderColor: getSeverity(primaryAlert.severity).color },
                ]}>
                  <View style={[
                    styles.severityDot,
                    { backgroundColor: getSeverity(primaryAlert.severity).color },
                  ]} />
                  <Text style={[
                    styles.severityLabel,
                    { color: getSeverity(primaryAlert.severity).color },
                  ]}>
                    {getSeverity(primaryAlert.severity).label}
                  </Text>
                </View>

                <View style={styles.primaryRow}>
                  <Ionicons
                    name={getSeverity(primaryAlert.severity).iconName}
                    size={36}
                    color={getSeverity(primaryAlert.severity).color}
                  />
                  <Text style={styles.primaryTitle} numberOfLines={2}>
                    {primaryAlert.title}
                  </Text>
                </View>

                <Text style={styles.primaryDescription}>
                  {primaryAlert.description}
                </Text>

                <View style={styles.primaryMeta}>
                  {primaryAlert.location && (
                    <View style={styles.metaItem}>
                      <Text style={styles.metaLabel}>ZONA</Text>
                      <Text style={styles.metaValue}>{primaryAlert.location}</Text>
                    </View>
                  )}
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>FECHA</Text>
                    <Text style={styles.metaValue}>
                      {new Date(primaryAlert.created_at).toLocaleTimeString('es-ES', {
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  {!primaryAlert.is_read && (
                    <View style={styles.metaItem}>
                      <Text style={styles.metaLabel}>ESTADO</Text>
                      <Text style={[styles.metaValue, { color: '#90cdfd' }]}>Sin leer</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            )}

            {/* ── Alertas secundarias ── */}
            {secondaryAlerts.length > 0 && (
              <View style={styles.secondaryGrid}>
                {secondaryAlerts.map((item) => {
                  const sev = getSeverity(item.severity);
                  return (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [
                        styles.secondaryCard,
                        { borderLeftColor: sev.color },
                        pressed && { opacity: 0.85 },
                      ]}
                      onPress={() => handlePress(item)}
                    >
                      <View style={styles.secondaryHeader}>
                        <View style={styles.secondaryTitleRow}>
                          <Ionicons name={sev.iconName} size={22} color={sev.color} />
                          <Text style={styles.secondaryTitle} numberOfLines={1}>
                            {item.title}
                          </Text>
                        </View>
                        <View style={[styles.miniBadge, { borderColor: sev.color }]}>
                          <Text style={[styles.miniBadgeText, { color: sev.color }]}>
                            {sev.label}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.secondaryDescription} numberOfLines={2}>
                        {item.description}
                      </Text>

                      <Pressable
                        style={({ pressed }) => [styles.detailBtn, pressed && { opacity: 0.7 }]}
                        onPress={() => handlePress(item)}
                      >
                        <Text style={styles.detailBtnText}>Ver detalles</Text>
                        <Ionicons name="arrow-forward" size={13} color="rgba(255,255,255,0.8)" />
                      </Pressable>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}

        {/* ── Recomendaciones de seguridad ── */}
        <View style={styles.safetySection}>
          <View style={styles.safetyTitleRow}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#FFFFFF" />
            <Text style={styles.safetyTitle}>Recomendaciones de seguridad</Text>
          </View>
          <View style={styles.safetyGrid}>
            {SAFETY_TIPS.map((tip) => (
              <View key={tip.text} style={styles.safetyCard}>
                <View style={styles.safetyIconWrap}>
                  <Ionicons name={tip.iconName} size={22} color="rgba(255,255,255,0.85)" />
                </View>
                <Text style={styles.safetyText}>{tip.text}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0e11',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0c0e11',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingTop: 60,
    paddingBottom: 32,
    paddingHorizontal: 20,
    gap: 16,
  },

  /* ── Header ── */
  header: {
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },

  /* ── Empty ── */
  emptyCard: {
    backgroundColor: GLASS_BG,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  emptyText: { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 20 },

  /* ── Primary alert card ── */
  primaryCard: {
    backgroundColor: 'rgba(255,180,171,0.10)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,180,171,0.25)',
    padding: 24,
    gap: 16,
  },
  severityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  severityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  severityLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  primaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  primaryTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 28,
  },
  primaryDescription: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 24,
  },
  primaryMeta: {
    flexDirection: 'row',
    gap: 24,
    borderTopWidth: 1,
    borderTopColor: GLASS_BORDER,
    paddingTop: 16,
  },
  metaItem: { gap: 4 },
  metaLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.4)',
  },
  metaValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  /* ── Secondary alerts ── */
  secondaryGrid: {
    gap: 12,
  },
  secondaryCard: {
    backgroundColor: GLASS_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderLeftWidth: 4,
    padding: 20,
    gap: 10,
  },
  secondaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  secondaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  secondaryTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  miniBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  miniBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  secondaryDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 20,
  },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 12,
    paddingVertical: 10,
  },
  detailBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 0.3,
  },

  /* ── Safety tips ── */
  safetySection: {
    gap: 14,
    marginTop: 4,
  },
  safetyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  safetyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  safetyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  safetyCard: {
    width: '47%',
    backgroundColor: GLASS_BG,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    padding: 18,
    alignItems: 'center',
    gap: 10,
  },
  safetyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  safetyText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 18,
  },
});
