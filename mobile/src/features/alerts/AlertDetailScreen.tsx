import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Alert } from '../../types';

export default function AlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [alert, setAlert] = useState<Alert | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlert();
  }, [id]);

  const loadAlert = async () => {
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      if (!apiUrl) return;
      const response = await fetch(`${apiUrl}/alerts/${id}`);
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
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      if (!apiUrl) return;
      await fetch(`${apiUrl}/alerts/${id}/read`, { method: 'PATCH' });
      setAlert({ ...alert, is_read: true });
    } catch (error) {
      console.warn('Error marking as read:', error);
    }
  };

  const getSeverityStyle = (severity: Alert['severity']) => {
    switch (severity) {
      case 'critical': return { bg: '#FDEAEA', text: '#A33A3A' };
      case 'warning':  return { bg: '#FFF4E5', text: '#B87506' };
      default:         return { bg: '#E5F4FF', text: '#0066CC' };
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
        <ActivityIndicator size="large" color="#2A7A4B" />
      </View>
    );
  }

  if (!alert) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Alerta no encontrada</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Volver</Text>
        </Pressable>
      </View>
    );
  }

  const severityStyles = getSeverityStyle(alert.severity);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backNav} onPress={() => router.back()}>
          <Text style={styles.backText}>← Volver</Text>
        </Pressable>
      </View>

      <View style={[styles.severityBadge, { backgroundColor: severityStyles.bg }]}>
        <Text style={[styles.severityText, { color: severityStyles.text }]}>
          {getSeverityLabel(alert.severity)}
        </Text>
      </View>

      <Text style={styles.title}>{alert.title}</Text>

      {alert.location && (
        <View style={styles.locationRow}>
          <Text style={styles.locationIcon}>📍</Text>
          <Text style={styles.locationText}>{alert.location}</Text>
        </View>
      )}

      <Text style={styles.dateLabel}>
        {new Date(alert.created_at).toLocaleDateString('es-ES', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })}
      </Text>

      <View style={styles.divider} />
      <Text style={styles.sectionTitle}>Descripción</Text>
      <Text style={styles.description}>{alert.description}</Text>

      {alert.recommendations && alert.recommendations.length > 0 && (
        <>
          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>Recomendaciones</Text>
          {alert.recommendations.map((rec, index) => (
            <View key={index} style={styles.recommendationItem}>
              <Text style={styles.recommendationBullet}>•</Text>
              <Text style={styles.recommendationText}>{rec}</Text>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#F1F5F2' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: { marginBottom: 16 },
  backNav: { paddingVertical: 8 },
  backText: { fontSize: 16, color: '#2A7A4B' },
  severityBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, marginBottom: 12 },
  severityText: { fontSize: 13, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '700', color: '#0B1411', lineHeight: 30 },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 6 },
  locationIcon: { fontSize: 14 },
  locationText: { fontSize: 14, color: '#52655A' },
  dateLabel: { marginTop: 8, fontSize: 13, color: '#6E7F77' },
  divider: { height: 1, backgroundColor: '#D6DED9', marginVertical: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#0B1411', marginBottom: 12 },
  description: { fontSize: 15, color: '#1F2A44', lineHeight: 24 },
  recommendationItem: { flexDirection: 'row', marginBottom: 10 },
  recommendationBullet: { marginRight: 8, color: '#2A7A4B', fontWeight: '600' },
  recommendationText: { flex: 1, fontSize: 14, color: '#1F2A44', lineHeight: 20 },
  markReadButton: { marginTop: 24, backgroundColor: '#2A7A4B', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  markReadButtonPressed: { opacity: 0.85 },
  markReadText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  backButton: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderColor: '#2A7A4B', borderRadius: 8 },
  backButtonText: { color: '#2A7A4B', fontSize: 16 },
  errorText: { fontSize: 16, color: '#A33A3A' },
});
