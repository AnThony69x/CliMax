import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert as NativeAlert,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '../../core/api/weatherApi';
import { getSession, supabase } from '../../core/auth/supabaseClient';
import type { Alert as WeatherAlert } from '../../types';
import { useIntelligentAlerts } from '../../hooks/useIntelligentAlerts';
import { IntelligentAlertCardImproved } from '../../components/IntelligentAlertCardImproved';
import { PremiumReveal } from '../../components/PremiumMotion';
import { premiumColors, premiumShadow } from '../../theme/premium';
import { useWeatherScene } from '../../core/weather/WeatherSceneContext';
import { WeatherSceneBackground } from '../../components/weather/WeatherSceneBackground';
import { useAccountPreferences } from '../../core/preferences/accountPreferences';

const GLASS_BG     = premiumColors.glass;
const GLASS_BORDER = premiumColors.glassBorder;
const SURFACE_DEEP = premiumColors.surface;
const ACCENT       = premiumColors.accent;

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
type EvidenceSeverity = 'info' | 'warning' | 'critical';
type SafetyTip = { iconName: IoniconName; text: string };

type AlertEvidence = {
  id: string;
  title: string;
  description: string;
  severity: EvidenceSeverity;
  is_read: boolean;
  created_at: string;
  image_url: string;
  image_path: string | null;
};

const SEVERITY_CONFIG: Record<string, {
  label: string;
  color: string;
  iconName: IoniconName;
}> = {
  critical: { label: 'CRÍTICO',  color: '#ffb4ab', iconName: 'thunderstorm-outline' },
  warning:  { label: 'MODERADO', color: '#ffb95a', iconName: 'rainy-outline'        },
  info:     { label: 'AVISO',    color: ACCENT, iconName: 'partly-sunny-outline' },
};

const DEFAULT_SAFETY_TIPS: SafetyTip[] = [
  { iconName: 'flashlight-outline', text: 'Prepare linternas y baterias de respaldo' },
  { iconName: 'notifications-outline', text: 'Mantenga activas alertas meteorologicas oficiales' },
  { iconName: 'medical-outline', text: 'Revise su botiquin y suministros basicos' },
  { iconName: 'water-outline', text: 'Mantenga agua disponible para hidratacion' },
];

const RISK_PRIORITY: Record<'low' | 'medium' | 'high' | 'severe', number> = {
  low: 1,
  medium: 2,
  high: 3,
  severe: 4,
};

const RISK_SAFETY_TIP: Record<'low' | 'medium' | 'high' | 'severe', SafetyTip> = {
  low: { iconName: 'checkmark-circle-outline', text: 'Mantenga monitoreo preventivo del clima local' },
  medium: { iconName: 'alert-circle-outline', text: 'Tenga lista una mochila de emergencia básica' },
  high: { iconName: 'warning-outline', text: 'Evite salir y asegure puertas, ventanas y objetos sueltos' },
  severe: { iconName: 'thunderstorm-outline', text: 'Refúgiese de inmediato y siga instrucciones oficiales' },
};

const RISK_BASELINE_TIPS: Record<'low' | 'medium' | 'high' | 'severe', SafetyTip[]> = {
  low: [
    { iconName: 'flashlight-outline', text: 'Prepare linternas y baterias de respaldo' },
    { iconName: 'notifications-outline', text: 'Mantenga activas alertas meteorologicas oficiales' },
    { iconName: 'water-outline', text: 'Mantenga agua disponible para hidratacion' },
  ],
  medium: [
    { iconName: 'flashlight-outline', text: 'Prepare linternas y baterias de respaldo' },
    { iconName: 'bag-add-outline', text: 'Prepare una mochila de emergencia ligera' },
    { iconName: 'car-outline', text: 'Planifique rutas alternativas por precaucion' },
  ],
  high: [
    { iconName: 'home-outline', text: 'Permanezca bajo techo mientras pasa el evento' },
    { iconName: 'flash-outline', text: 'Desconecte aparatos sensibles durante tormenta electrica' },
    { iconName: 'car-outline', text: 'Evite desplazamientos no esenciales' },
  ],
  severe: [
    { iconName: 'home-outline', text: 'Refugiese de inmediato en un lugar seguro' },
    { iconName: 'flash-outline', text: 'Desconecte aparatos y corte energia si hay riesgo electrico' },
    { iconName: 'car-outline', text: 'No se desplace salvo instruccion oficial' },
  ],
};

const ACTION_KEYWORD_TIPS: Array<{
  keywords: string[];
  tip: SafetyTip;
}> = [
  {
    keywords: ['refugio', 'evacua', 'resguard'],
    tip: { iconName: 'home-outline', text: 'Identifique y prepare su refugio más seguro' },
  },
  {
    keywords: ['transporte', 'conducción', 'manej', 'movilidad'],
    tip: { iconName: 'car-outline', text: 'Limite desplazamientos y evite rutas inundables' },
  },
  {
    keywords: ['informar', 'vigilancia', 'monitore', 'alerta'],
    tip: { iconName: 'notifications-outline', text: 'Mantenga activas notificaciones y canales oficiales' },
  },
  {
    keywords: ['hidrat', 'calor', 'temperatura'],
    tip: { iconName: 'water-outline', text: 'Aumente hidratación y evite exposición prolongada al calor' },
  },
  {
    keywords: ['proteger', 'posesiones', 'asegurar', 'ventana'],
    tip: { iconName: 'shield-checkmark-outline', text: 'Proteja documentos y equipos ante lluvia o viento fuerte' },
  },
];

export default function AlertsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { code: weatherCode, isNight, scene } = useWeatherScene();
  const preferences = useAccountPreferences();
  const ACCENT = scene.accent;
  const headerInk = scene.ink === 'dark' ? '#1b2027' : '#fdf9f3';
  const headerMuted = scene.ink === 'dark' ? premiumColors.inkSubtle : 'rgba(253,249,243,0.78)';
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [evidences, setEvidences] = useState<AlertEvidence[]>([]);
  const [sessionReady, setSessionReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // ── Alertas inteligentes de Groq ──
  const {
    alerts: intelligentAlerts,
    loading: intelligentLoading,
    markAsRead: markIntelligentAsRead,
    provideFeedback: provideIntelligentFeedback,
    fetchAlerts: reloadIntelligentAlerts,
    analyzeLocation,
    canUseAdvancedAlerts,
  } = useIntelligentAlerts();

  const [formOpen, setFormOpen] = useState(false);
  const [analyzingLocation, setAnalyzingLocation] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reloadingEvidence, setReloadingEvidence] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<EvidenceSeverity>('warning');
  const [imageUri, setImageUri] = useState<string | null>(null);

  useEffect(() => {
    void loadAuthState();
  }, []);

  // Alertas inteligentes se cargan automáticamente con el hook useIntelligentAlerts()

  const loadAuthState = async () => {
    try {
      const current = await getSession();
      if (!current?.user?.id) {
        setIsLoggedIn(false);
        setUserId(null);
        setEvidences([]);
        return;
      }
      setIsLoggedIn(true);
      setUserId(current.user.id);
      void loadEvidences(current.user.id);
    } catch {
      setIsLoggedIn(false);
      setUserId(null);
      setEvidences([]);
    } finally {
      setSessionReady(true);
    }
  };

  const loadEvidences = async (uid: string) => {
    setReloadingEvidence(true);
    try {
      const { data, error } = await supabase
        .from('weather_alert_reports')
        .select('id,title,description,severity,is_read,created_at,image_url,image_path')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEvidences((data ?? []) as AlertEvidence[]);
    } catch (error) {
      console.warn('Error loading evidences:', error);
      setEvidences([]);
    } finally {
      setReloadingEvidence(false);
    }
  };

  const markAsRead = async (alertId: string) => {
    try {
      await fetch(`${API_URL}/alerts/${alertId}/read`, { method: 'PATCH' });
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, is_read: true } : a)));
    } catch (error) {
      console.warn('Error marking alert as read:', error);
    }
  };

  const handlePress = (alert: WeatherAlert) => {
    if (!alert.is_read) markAsRead(alert.id);
    router.push(`/alert/${alert.id}` as any);
  };

  const pickFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      NativeAlert.alert(
        'Permiso requerido',
        'Debes permitir acceso a la galeria para seleccionar una imagen.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      setImageUri(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      NativeAlert.alert(
        'Permiso requerido',
        'Debes permitir acceso a la camara para tomar una foto.'
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      setImageUri(result.assets[0].uri);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setSeverity('warning');
    setImageUri(null);
  };

  const analyzeCurrentLocation = async () => {
    if (analyzingLocation) return;

    setAnalyzingLocation(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        NativeAlert.alert(
          'Permiso requerido',
          'Debes permitir acceso a tu ubicacion para generar una alerta personalizada.'
        );
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      let address: string | null = null;
      try {
        const places = await Location.reverseGeocodeAsync({ latitude, longitude });
        const place = places[0];
        address = place
          ? [place.city, place.region, place.country].filter(Boolean).join(', ') || null
          : null;
      } catch {
        address = null;
      }

      await analyzeLocation({ latitude, longitude, address });
      await reloadIntelligentAlerts();

      NativeAlert.alert(
        'Analisis listo',
        'CliMax genero una alerta inteligente con recomendaciones para tu ubicacion actual.'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo analizar la ubicacion.';
      NativeAlert.alert('Error', message);
    } finally {
      setAnalyzingLocation(false);
    }
  };

  const createEvidence = async () => {
    if (!isLoggedIn || !userId) {
      NativeAlert.alert('Inicia sesion', 'Debes iniciar sesion para subir evidencias.');
      return;
    }
    if (!imageUri) {
      NativeAlert.alert('Falta imagen', 'Selecciona o toma una foto antes de guardar.');
      return;
    }
    if (!description.trim()) {
      NativeAlert.alert('Falta descripcion', 'Escribe una observacion para la alerta.');
      return;
    }

    setUploading(true);
    try {
      const ext = imageUri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const imagePath = `${userId}/${fileName}`;

      const response = await fetch(imageUri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('alert-evidences')
        .upload(imagePath, blob, { upsert: false, contentType: `image/${ext}` });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from('alert-evidences').getPublicUrl(imagePath);
      const imageUrl = publicData.publicUrl;

      const { error: insertError } = await supabase.from('weather_alert_reports').insert({
        user_id: userId,
        title: title.trim() || 'Alerta reportada por usuario',
        description: description.trim(),
        severity,
        is_read: false,
        image_url: imageUrl,
        image_path: imagePath,
      });
      if (insertError) throw insertError;

      await loadEvidences(userId);
      resetForm();
      setFormOpen(false);
      NativeAlert.alert('Guardado', 'La evidencia fue registrada correctamente.');
    } catch (error: any) {
      console.warn('Error creating evidence:', error);
      NativeAlert.alert('Error', error?.message ?? 'No se pudo guardar la evidencia.');
    } finally {
      setUploading(false);
    }
  };

  const markEvidenceAsRead = async (evidenceId: string) => {
    if (!userId) return;
    try {
      const { error } = await supabase
        .from('weather_alert_reports')
        .update({ is_read: true })
        .eq('id', evidenceId)
        .eq('user_id', userId);
      if (error) throw error;
      setEvidences((prev) => prev.map((e) => (e.id === evidenceId ? { ...e, is_read: true } : e)));
    } catch (error) {
      console.warn('Error marking evidence as read:', error);
    }
  };

  const deleteEvidence = async (evidence: AlertEvidence) => {
    if (!userId) return;
    try {
      const { error } = await supabase
        .from('weather_alert_reports')
        .delete()
        .eq('id', evidence.id)
        .eq('user_id', userId);
      if (error) throw error;

      if (evidence.image_path) {
        await supabase.storage.from('alert-evidences').remove([evidence.image_path]);
      }

      setEvidences((prev) => prev.filter((e) => e.id !== evidence.id));
    } catch (error) {
      console.warn('Error deleting evidence:', error);
      NativeAlert.alert('Error', 'No se pudo eliminar la evidencia.');
    }
  };

  const unreadCount = intelligentAlerts?.filter((a) => !a.is_read).length ?? 0;
  const hasAlerts = intelligentAlerts && intelligentAlerts.length > 0;
  const showingIntelligentLoading = intelligentLoading && !hasAlerts;
  const adaptiveSafetyTips = useMemo<SafetyTip[]>(() => {
    if (!intelligentAlerts || intelligentAlerts.length === 0) return DEFAULT_SAFETY_TIPS;

    const sortedAlerts = [...intelligentAlerts].sort((a, b) => {
      const unreadDelta = Number(a.is_read) - Number(b.is_read);
      if (unreadDelta !== 0) return unreadDelta;
      return RISK_PRIORITY[b.risk_level] - RISK_PRIORITY[a.risk_level];
    });

    const primaryAlert = sortedAlerts[0];
    const tips: SafetyTip[] = [RISK_SAFETY_TIP[primaryAlert.risk_level]];

    sortedAlerts
      .slice(0, 3)
      .flatMap((alert) => alert.recommended_actions ?? [])
      .forEach((action) => {
        const normalizedAction = action.toLowerCase();
        const match = ACTION_KEYWORD_TIPS.find(({ keywords }) =>
          keywords.some((keyword) => normalizedAction.includes(keyword))
        );
        if (match) tips.push(match.tip);
      });

    const baselineTips = RISK_BASELINE_TIPS[primaryAlert.risk_level];
    const uniqueTips = [...tips, ...baselineTips, ...DEFAULT_SAFETY_TIPS].filter(
      (tip, index, allTips) => allTips.findIndex((currentTip) => currentTip.text === tip.text) === index
    );

    return uniqueTips.slice(0, 4);
  }, [intelligentAlerts]);

  if (!sessionReady) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle={scene.ink === 'dark' ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle={scene.ink === 'dark' ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
      <WeatherSceneBackground code={weatherCode} isNight={isNight} particlesEnabled={!preferences.dataSaver} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 14,
            paddingBottom: Math.max(insets.bottom, 16) + 28,
          },
        ]}
      >
        {/* ── Encabezado ── */}
        <PremiumReveal style={styles.header}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerTitleBlock}>
              <Text style={[styles.eyebrow, { color: headerMuted }]}>Panel</Text>
              <Text style={[styles.title, { color: headerInk }]}>Alertas meteorológicas</Text>
            </View>
            {unreadCount > 0 ? (
              <View style={styles.unreadPill}>
                <Text style={styles.unreadPillText}>{unreadCount}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.subtitle, { color: headerMuted }]}>
            {unreadCount > 0
              ? `${unreadCount} alerta${unreadCount > 1 ? 's' : ''} sin leer`
              : 'Sin alertas pendientes'}
          </Text>
        </PremiumReveal>

        {/* ── Alertas inteligentes de Groq ── */}
        <PremiumReveal delay={45} style={styles.aiActionCard}>
          <View style={styles.aiActionTextBlock}>
            <View style={styles.aiActionTitleRow}>
              <Ionicons name="sparkles" size={17} color={ACCENT} />
              <Text style={styles.aiActionTitle}>IA meteorologica</Text>
            </View>
            <Text style={styles.aiActionText}>
              Analiza tu ubicacion actual y genera recomendaciones personalizadas.
            </Text>
          </View>
          <Pressable
            style={[styles.aiActionButton, analyzingLocation && styles.aiActionButtonDisabled]}
            onPress={analyzeCurrentLocation}
            disabled={analyzingLocation}
          >
            {analyzingLocation ? (
              <ActivityIndicator size="small" color={premiumColors.accentDeep} />
            ) : (
              <Ionicons name="locate-outline" size={18} color={premiumColors.accentDeep} />
            )}
            <Text style={styles.aiActionButtonText}>
              {analyzingLocation ? 'Analizando...' : 'Analizar ahora'}
            </Text>
          </Pressable>
        </PremiumReveal>

        {intelligentAlerts && intelligentAlerts.length > 0 && (
          <PremiumReveal delay={90} style={styles.intelligentAlertsSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrap}>
                <Ionicons name="sparkles" size={18} color={ACCENT} />
              </View>
              <View style={styles.sectionHeaderTextWrap}>
                <Text style={styles.sectionEyebrow}>IA</Text>
                <Text style={styles.sectionTitle}>Análisis de riesgo</Text>
              </View>
              <View style={styles.sectionHeaderAccent} />
            </View>
            {intelligentAlerts.map((alert) => (
              <IntelligentAlertCardImproved
                key={alert.id}
                alert={alert}
                onMarkAsRead={() => markIntelligentAsRead(alert.id as string)}
                onProvideFeedback={(_, feedback) =>
                  provideIntelligentFeedback(alert.id as string, feedback)
                }
                canProvideFeedback={canUseAdvancedAlerts}
              />
            ))}
          </PremiumReveal>
        )}

        {showingIntelligentLoading && (
          <PremiumReveal delay={90} style={styles.emptyCard}>
            <ActivityIndicator size="small" color={ACCENT} />
            <Text style={styles.emptyTitle}>Cargando alertas inteligentes...</Text>
            <Text style={styles.emptyText}>
              Estamos analizando las condiciones de riesgo en tu zona.
            </Text>
          </PremiumReveal>
        )}

        {!hasAlerts && !showingIntelligentLoading && (
          /* ── Estado vacío ── */
          <PremiumReveal delay={90} style={styles.emptyCard}>
            <Ionicons name="notifications-outline" size={48} color="rgba(255,255,255,0.4)" />
            <Text style={styles.emptyTitle}>Sin alertas inteligentes</Text>
            <Text style={styles.emptyText}>
              Te notificaremos cuando Groq AI detecte patrones de riesgo climático en tu zona.
            </Text>
          </PremiumReveal>
        )}

        {/* ── Recomendaciones de seguridad ── */}
        <PremiumReveal delay={160} style={styles.safetySection}>
          <View style={styles.safetyTitleRow}>
            <View style={styles.safetyTitleIconWrap}>
              <Ionicons name="shield-checkmark-outline" size={17} color={ACCENT} />
            </View>
            <Text style={styles.safetyTitle}>
              {hasAlerts ? 'Recomendaciones adaptativas (IA)' : 'Recomendaciones de seguridad'}
            </Text>
          </View>
          <View style={styles.safetyGrid}>
            {adaptiveSafetyTips.map((tip) => (
              <View key={tip.text} style={styles.safetyCard}>
                <View style={styles.safetyIconWrap}>
                  <Ionicons name={tip.iconName} size={21} color={ACCENT} />
                </View>
                <Text style={styles.safetyText}>{tip.text}</Text>
              </View>
            ))}
          </View>
        </PremiumReveal>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SURFACE_DEEP,
    overflow: 'hidden',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: SURFACE_DEEP,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 18,
  },

  header: {
    marginBottom: 6,
    gap: 8,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.15,
    color: premiumColors.inkSubtle,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 27,
    fontWeight: '700',
    color: premiumColors.ink,
    letterSpacing: -0.4,
  },
  unreadPill: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: `${ACCENT}2e`,
    borderWidth: 1,
    borderColor: `${ACCENT}73`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadPillText: {
    fontSize: 13,
    fontWeight: '800',
    color: ACCENT,
    fontVariant: ['tabular-nums'],
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: premiumColors.inkSubtle,
    lineHeight: 20,
  },
  aiActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: `${ACCENT}3d`,
    backgroundColor: premiumColors.surfaceElevated,
  },
  aiActionTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  aiActionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiActionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: premiumColors.ink,
  },
  aiActionText: {
    fontSize: 12,
    lineHeight: 17,
    color: premiumColors.inkMuted,
  },
  aiActionButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: ACCENT,
  },
  aiActionButtonDisabled: {
    opacity: 0.72,
  },
  aiActionButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: premiumColors.accentDeep,
  },

  emptyCard: {
    backgroundColor: premiumColors.surfaceStrong,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: `${ACCENT}24`,
    padding: 36,
    alignItems: 'center',
    gap: 14,
    ...premiumShadow('medium'),
  },
  emptyTitle: { fontSize: 19, fontWeight: '700', color: premiumColors.ink },
  emptyText: {
    fontSize: 14,
    color: premiumColors.inkSubtle,
    textAlign: 'center',
    lineHeight: 21,
  },

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
    color: premiumColors.ink,
    lineHeight: 28,
  },
  primaryDescription: {
    fontSize: 16,
    color: premiumColors.inkMuted,
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
    color: premiumColors.inkSubtle,
  },
  metaValue: {
    fontSize: 15,
    fontWeight: '600',
    color: premiumColors.ink,
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
    color: premiumColors.ink,
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
    color: premiumColors.inkMuted,
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
    color: premiumColors.inkMuted,
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
    gap: 10,
  },
  safetyTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: premiumColors.ink,
    lineHeight: 22,
  },
  safetyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  safetyCard: {
    width: '47%',
    backgroundColor: premiumColors.surfaceElevated,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: `${ACCENT}24`,
    padding: 16,
    alignItems: 'center',
    gap: 10,
  },
  safetyIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: `${ACCENT}14`,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    justifyContent: 'center',
    alignItems: 'center',
  },
  safetyText: {
    fontSize: 12,
    fontWeight: '600',
    color: premiumColors.inkMuted,
    textAlign: 'center',
    lineHeight: 17,
  },

  /* ── Evidence CRUD ── */
  evidenceSection: {
    marginTop: 6,
    gap: 12,
  },
  evidenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  evidenceTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: premiumColors.ink,
  },
  authCard: {
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 20,
    padding: 18,
    gap: 10,
  },
  authTitle: {
    color: premiumColors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  authText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    lineHeight: 20,
  },
  authActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  authPrimaryBtn: {
    flex: 1,
    backgroundColor: '#2A7A4B',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  authPrimaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  authGhostBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  authGhostBtnText: {
    color: premiumColors.ink,
    fontWeight: '600',
  },
  toggleComposerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(42,122,75,0.8)',
    borderRadius: 12,
    paddingVertical: 12,
  },
  toggleComposerBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  composerCard: {
    backgroundColor: GLASS_BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    padding: 16,
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: premiumColors.ink,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  severityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  severityOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 9,
  },
  severityOptionActive: {
    backgroundColor: 'rgba(226,98,43,0.16)',
    borderColor: ACCENT,
  },
  severityOptionText: {
    color: premiumColors.ink,
    fontSize: 11,
    fontWeight: '700',
  },
  emptyPreview: {
    height: 160,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: GLASS_BORDER,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyPreviewText: {
    color: premiumColors.inkSubtle,
  },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: 14,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 10,
  },
  photoBtn: {
    flex: 1,
    backgroundColor: '#1565c0',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 11,
  },
  photoBtnSecondary: {
    flex: 1,
    backgroundColor: '#00897b',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 11,
  },
  photoBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#2e7d32',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 11,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  cleanBtn: {
    width: 100,
    backgroundColor: '#6b7280',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleanBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  gallerySection: {
    gap: 10,
    paddingBottom: 10,
  },
  galleryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: premiumColors.ink,
  },
  galleryEmpty: {
    color: premiumColors.inkSubtle,
    fontSize: 13,
  },
  evidenceCard: {
    flexDirection: 'row',
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 14,
    overflow: 'hidden',
  },
  evidenceImage: {
    width: 92,
    height: 92,
  },
  evidenceCardBody: {
    flex: 1,
    padding: 10,
    gap: 4,
  },
  evidenceCardTitle: {
    color: premiumColors.ink,
    fontWeight: '700',
    fontSize: 14,
  },
  evidenceCardDescription: {
    color: premiumColors.inkMuted,
    fontSize: 12,
  },
  evidenceMetaRow: {
    marginTop: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  evidenceMetaText: {
    color: premiumColors.inkSubtle,
    fontSize: 11,
  },
  unreadText: {
    color: ACCENT,
    fontWeight: '700',
  },
  evidenceActions: {
    marginTop: 4,
    flexDirection: 'row',
    gap: 8,
  },
  smallActionBtn: {
    backgroundColor: 'rgba(226,98,43,0.14)',
    borderWidth: 1,
    borderColor: ACCENT,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  smallDangerBtn: {
    backgroundColor: 'rgba(255,90,90,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,120,120,0.7)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  smallActionBtnText: {
    color: premiumColors.ink,
    fontSize: 11,
    fontWeight: '700',
  },

  /* ── Community locked background ── */
  communitySkeletonWrap: {
    marginTop: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(9,12,18,0.95)',
    padding: 14,
    gap: 10,
    overflow: 'hidden',
  },
  communitySkeletonTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
  },
  communitySkeletonCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 10,
  },
  communitySkeletonThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  communitySkeletonBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 7,
  },
  communitySkeletonLineLg: {
    width: '86%',
    height: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  communitySkeletonLineMd: {
    width: '72%',
    height: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  communitySkeletonLineSm: {
    width: '54%',
    height: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  communityOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.58)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 12,
  },
  communityOverlayTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  communityOverlayBtn: {
    backgroundColor: '#2A7A4B',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  communityOverlayBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },

  /* ── Alertas Inteligentes ── */
  intelligentAlertsSection: {
    gap: 14,
    marginVertical: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 2,
    marginBottom: 6,
  },
  sectionHeaderTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  sectionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: `${ACCENT}1f`,
    borderWidth: 1,
    borderColor: `${ACCENT}42`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: premiumColors.inkSubtle,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: premiumColors.ink,
    marginTop: 2,
    letterSpacing: -0.2,
  },
  sectionHeaderAccent: {
    width: 4,
    height: 38,
    borderRadius: 4,
    backgroundColor: ACCENT,
    opacity: 0.65,
  },
  safetyTitleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: `${ACCENT}1f`,
    borderWidth: 1,
    borderColor: `${ACCENT}38`,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
