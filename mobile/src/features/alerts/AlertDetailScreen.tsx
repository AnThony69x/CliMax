import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '../../core/api/weatherApi';
import type { Alert } from '../../types';
import { premiumColors, premiumRadii, premiumShadow, premiumType } from '../../theme/premium';
import { useWeatherScene } from '../../core/weather/WeatherSceneContext';
import { WeatherSceneBackground } from '../../components/weather/WeatherSceneBackground';
import { useAccountPreferences } from '../../core/preferences/accountPreferences';

export default function AlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { code: weatherCode, isNight, scene } = useWeatherScene();
  const preferences = useAccountPreferences();
  const headerInk = scene.ink === 'dark' ? '#1b2027' : '#fdf9f3';
  const headerMuted = scene.ink === 'dark' ? premiumColors.inkSubtle : 'rgba(253,249,243,0.78)';
  const headerMutedStrong = scene.ink === 'dark' ? premiumColors.inkMuted : 'rgba(253,249,243,0.88)';
  const dividerColor = scene.ink === 'dark' ? premiumColors.glassBorder : 'rgba(253,249,243,0.12)';
  const [alert, setAlert] = useState<Alert | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlert();
  }, [id]);

  const loadAlert = async () => {
    try {
      const response = await fetch(`${API_URL}/alerts/${id}`);
      if (response.ok) {
        const data = await response.json();
        setAlert(data.data);
      }
    } catch (error) {
      console.warn('Error loading alert:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async () => {
    if (!alert || alert.is_read) return;
    try {
      await fetch(`${API_URL}/alerts/${id}/read`, { method: 'PATCH' });
      setAlert({ ...alert, is_read: true });
    } catch (error) {
      console.warn('Error marking as read:', error);
    }
  };

  const getSeverityStyle = (severity: Alert['severity']) => {
    switch (severity) {
      case 'critical': return { bg: 'rgba(251,113,133,0.14)', border: 'rgba(251,113,133,0.4)', text: premiumColors.danger };
      case 'warning':  return { bg: 'rgba(251,191,36,0.14)', border: 'rgba(251,191,36,0.4)', text: premiumColors.warning };
      default:         return { bg: `${scene.accent}24`, border: `${scene.accent}59`, text: scene.accent };
    }
  };

  const getSeverityLabel = (severity: Alert['severity']) => {
    switch (severity) {
      case 'critical': return 'Alerta crítica';
      case 'warning':  return 'Advertencia';
      default:         return 'Información';
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <StatusBar barStyle={scene.ink === 'dark' ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
        <WeatherSceneBackground code={weatherCode} isNight={isNight} particlesEnabled={!preferences.dataSaver} />
        <ActivityIndicator size="large" color={scene.accent} />
      </View>
    );
  }

  if (!alert) {
    return (
      <View style={[styles.container, styles.centered]}>
        <StatusBar barStyle={scene.ink === 'dark' ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
        <WeatherSceneBackground code={weatherCode} isNight={isNight} particlesEnabled={!preferences.dataSaver} />
        <Text style={styles.errorText}>Alerta no encontrada</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Volver</Text>
        </Pressable>
      </View>
    );
  }

  const severityStyles = getSeverityStyle(alert.severity);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={scene.ink === 'dark' ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
      <WeatherSceneBackground code={weatherCode} isNight={isNight} particlesEnabled={!preferences.dataSaver} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 14, paddingBottom: Math.max(insets.bottom, 16) + 28 }}
      >
      <View style={styles.header}>
        <Pressable style={styles.backNav} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color={scene.accent} />
          <Text style={styles.backText}>Volver</Text>
        </Pressable>
      </View>

      <View style={[styles.severityBadge, { backgroundColor: severityStyles.bg, borderColor: severityStyles.border }]}>
        <Text style={[styles.severityText, { color: severityStyles.text }]}>
          {getSeverityLabel(alert.severity)}
        </Text>
      </View>

      <Text style={[styles.title, { color: headerInk }]}>{alert.title}</Text>

      {alert.location && (
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={14} color={headerMuted} />
          <Text style={[styles.locationText, { color: headerMuted }]}>{alert.location}</Text>
        </View>
      )}

      <Text style={[styles.dateLabel, { color: headerMuted }]}>
        {new Date(alert.created_at).toLocaleDateString('es-ES', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })}
      </Text>

      <View style={[styles.divider, { backgroundColor: dividerColor }]} />
      <Text style={[styles.sectionTitle, { color: headerInk }]}>Descripción</Text>
      <Text style={[styles.description, { color: headerMutedStrong }]}>{alert.description}</Text>

      {alert.recommendations && alert.recommendations.length > 0 && (
        <>
          <View style={[styles.divider, { backgroundColor: dividerColor }]} />
          <Text style={[styles.sectionTitle, { color: headerInk }]}>Recomendaciones</Text>
          {alert.recommendations.map((rec, index) => (
            <View key={index} style={styles.recommendationItem}>
              <Text style={styles.recommendationBullet}>•</Text>
              <Text style={[styles.recommendationText, { color: headerMutedStrong }]}>{rec}</Text>
            </View>
          ))}
        </>
      )}

      {!alert.is_read && (
        <Pressable
          style={({ pressed }) => [styles.markReadButton, pressed && styles.markReadButtonPressed]}
          onPress={markAsRead}
        >
          <Text style={styles.markReadText}>Marcar como leída</Text>
        </Pressable>
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: premiumColors.surface, overflow: 'hidden' },
  scroll: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: { marginBottom: 16 },
  backNav: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, alignSelf: 'flex-start' },
  backText: { fontSize: 16, color: premiumColors.accent, fontWeight: '600' },
  severityBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: premiumRadii.sm,
    borderWidth: 1,
    marginBottom: 12,
  },
  severityText: { fontSize: 13, fontWeight: '700' },
  title: { ...premiumType.title, fontSize: 24, lineHeight: 30 },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 6 },
  locationText: { fontSize: 14, color: premiumColors.inkSubtle },
  dateLabel: { marginTop: 8, fontSize: 13, color: premiumColors.inkSubtle },
  divider: { height: 1, backgroundColor: premiumColors.glassBorder, marginVertical: 20 },
  sectionTitle: { ...premiumType.sectionTitle, marginBottom: 12 },
  description: { fontSize: 15, color: premiumColors.inkMuted, lineHeight: 24 },
  recommendationItem: { flexDirection: 'row', marginBottom: 10 },
  recommendationBullet: { marginRight: 8, color: premiumColors.accent, fontWeight: '700' },
  recommendationText: { flex: 1, fontSize: 14, color: premiumColors.inkMuted, lineHeight: 20 },
  markReadButton: {
    marginTop: 24,
    backgroundColor: premiumColors.accent,
    paddingVertical: 14,
    borderRadius: premiumRadii.md,
    alignItems: 'center',
    ...premiumShadow('soft'),
  },
  markReadButtonPressed: { opacity: 0.85 },
  markReadText: { color: premiumColors.accentDeep, fontSize: 16, fontWeight: '700' },
  backButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: premiumColors.glassBorderStrong,
    borderRadius: premiumRadii.sm,
  },
  backButtonText: { color: premiumColors.accent, fontSize: 16 },
  errorText: { fontSize: 16, color: premiumColors.danger },
});
