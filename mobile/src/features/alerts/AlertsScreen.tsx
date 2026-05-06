import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { getSession, supabase } from '../../core/auth/supabaseClient';
import type { Alert as WeatherAlert } from '../../types';
import { useIntelligentAlerts } from '../../hooks/useIntelligentAlerts';
import { IntelligentAlertCard } from '../../components/IntelligentAlertCard';

const GLASS_BG     = 'rgba(255,255,255,0.12)';
const GLASS_BORDER = 'rgba(255,255,255,0.18)';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
type EvidenceSeverity = 'info' | 'warning' | 'critical';

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
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [evidences, setEvidences] = useState<AlertEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // ── Alertas inteligentes de Groq ──
  const {
    alerts: intelligentAlerts,
    loading: intelligentLoading,
    markAsRead: markIntelligentAsRead,
    provideFeedback: provideIntelligentFeedback,
  } = useIntelligentAlerts();

  const [formOpen, setFormOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reloadingEvidence, setReloadingEvidence] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<EvidenceSeverity>('warning');
  const [imageUri, setImageUri] = useState<string | null>(null);

  useEffect(() => {
    void bootstrap();
  }, []);

  const bootstrap = async () => {
    await loadAuthState();
    setLoading(false);
  };

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
      await loadEvidences(current.user.id);
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
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      if (!apiUrl) return;
      await fetch(`${apiUrl}/alerts/${alertId}/read`, { method: 'PATCH' });
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

        {/* ── Alertas inteligentes de Groq ── */}
        {intelligentAlerts && intelligentAlerts.length > 0 && (
          <View style={styles.intelligentAlertsSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="sparkles" size={20} color="#90cdfd" />
              <Text style={styles.sectionTitle}>Análisis de Riesgo IA</Text>
            </View>
            {intelligentAlerts.map((alert) => (
              <IntelligentAlertCard
                key={alert.id}
                alert={alert}
                onMarkAsRead={() => markIntelligentAsRead(alert.id as string)}
                onProvideFeedback={(feedback) =>
                  provideIntelligentFeedback(alert.id as string, feedback)
                }
              />
            ))}
          </View>
        )}

        {!hasAlerts && (
          /* ── Estado vacío ── */
          <View style={styles.emptyCard}>
            <Ionicons name="notifications-outline" size={48} color="rgba(255,255,255,0.4)" />
            <Text style={styles.emptyTitle}>Sin alertas inteligentes</Text>
            <Text style={styles.emptyText}>
              Te notificaremos cuando Groq AI detecte patrones de riesgo climático en tu zona.
            </Text>
          </View>
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
    color: '#FFFFFF',
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
    color: '#FFFFFF',
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
    color: '#FFFFFF',
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
    color: '#FFFFFF',
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
    backgroundColor: 'rgba(144,205,253,0.22)',
    borderColor: '#90cdfd',
  },
  severityOptionText: {
    color: '#FFFFFF',
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
    color: 'rgba(255,255,255,0.55)',
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
    color: '#FFFFFF',
  },
  galleryEmpty: {
    color: 'rgba(255,255,255,0.6)',
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
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  evidenceCardDescription: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
  },
  evidenceMetaRow: {
    marginTop: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  evidenceMetaText: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 11,
  },
  unreadText: {
    color: '#90cdfd',
    fontWeight: '700',
  },
  evidenceActions: {
    marginTop: 4,
    flexDirection: 'row',
    gap: 8,
  },
  smallActionBtn: {
    backgroundColor: 'rgba(144,205,253,0.18)',
    borderWidth: 1,
    borderColor: '#90cdfd',
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
    color: '#FFFFFF',
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
    gap: 12,
    marginVertical: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#90cdfd',
    letterSpacing: 0.5,
  },
});
