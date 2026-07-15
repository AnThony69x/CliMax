import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { decode } from 'base64-arraybuffer';
import { AuthWeatherBubbles } from '../../components/AuthWeatherBubbles';
import { GaruaRainOverlay } from '../../components/GaruaRainOverlay';
import { API_URL } from '../../core/api/weatherApi';
import { clearToken } from '../../core/auth/authStorage';
import { getSession, signOut, supabase } from '../../core/auth/supabaseClient';
import type { User } from '../../types';
import { premiumColors, premiumShadow } from '../../theme/premium';
import { useWeatherScene } from '../../core/weather/WeatherSceneContext';
import { WeatherSceneBackground } from '../../components/weather/WeatherSceneBackground';

const { width: SW } = Dimensions.get('window');

const SURFACE   = premiumColors.surface;
const GLASS_BG  = premiumColors.glass;
const GLASS_BD  = premiumColors.glassBorder;
const ACCENT    = premiumColors.accent;
const ACCENT_DK = premiumColors.accentDeep;
const PROFILE_FETCH_TIMEOUT_MS = 12000;
const PROFILE_STATS_TTL_MS = 60 * 1000;

async function fetchProfileWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROFILE_FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

type Stats = { posts: number; reports: number; cities: number; daysActive: number };
type AccountPanel = 'preferences' | 'security' | null;
type PreferenceKey =
  | 'communityMentions'
  | 'weeklySummary'
  | 'dataSaver'
  | 'preciseLocation';

type AccountPreferences = Record<PreferenceKey, boolean>;

const ACCOUNT_PREFS_STORAGE_KEY = 'climax_account_preferences';
const DEFAULT_ACCOUNT_PREFERENCES: AccountPreferences = {
  communityMentions: true,
  weeklySummary: false,
  dataSaver: false,
  preciseLocation: true,
};

/* ───────────────────────────────────────── */
export default function ProfileScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { code: weatherCode, isNight, scene } = useWeatherScene();
  const ACCENT = scene.accent;

  const [profile,         setProfile]         = useState<User | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [editing,         setEditing]         = useState(false);
  const [name,            setName]            = useState('');
  const [saving,          setSaving]          = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [stats,           setStats]           = useState<Stats>({ posts: 0, reports: 0, cities: 0, daysActive: 0 });
  const [accountPanel,    setAccountPanel]    = useState<AccountPanel>(null);
  const [preferences,     setPreferences]     = useState<AccountPreferences>(DEFAULT_ACCOUNT_PREFERENCES);
  const statsRequestRef = useRef<Promise<void> | null>(null);
  const lastStatsRefreshAtRef = useRef(0);

  useEffect(() => { void bootstrap(); }, []);
  useEffect(() => {
    AsyncStorage.getItem(ACCOUNT_PREFS_STORAGE_KEY)
      .then((value) => {
        if (!value) return;
        const parsed = JSON.parse(value) as Partial<AccountPreferences>;
        setPreferences({ ...DEFAULT_ACCOUNT_PREFERENCES, ...parsed });
      })
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshProfileActivity();
    }, [])
  );

  /* ── bootstrap ── */
  const bootstrap = async () => {
    try {
      const session = await getSession();
      if (!session?.user) { setLoading(false); return; }
      const userId = (session.user as any).id as string;
      const createdAt = (session.user as any).created_at as string | undefined;

      await Promise.allSettled([
        loadStats(userId, createdAt),
        loadProfile(session),
      ]);
    } catch (e) {
      console.warn('bootstrapProfile', e);
      setLoading(false);
    }
  };

  const refreshProfileActivity = async () => {
    try {
      if (Date.now() - lastStatsRefreshAtRef.current < PROFILE_STATS_TTL_MS) return;
      const session = await getSession();
      if (!session?.user) return;
      const userId = (session.user as any).id as string;
      const createdAt = (session.user as any).created_at as string | undefined;
      await loadStats(userId, createdAt);
    } catch (e) {
      console.warn('refreshProfileActivity', e);
    }
  };

  /* ── load stats ── */
  const loadStats = async (userId: string, createdAt?: string) => {
    if (statsRequestRef.current) return statsRequestRef.current;

    const request = (async () => {
      const [postsRes, reportsRes, locRes] = await Promise.allSettled([
        supabase.from('community_posts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('weather_alert_reports').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('locations').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      ]);
      const posts    = postsRes.status   === 'fulfilled' ? (postsRes.value.count   ?? 0) : 0;
      const reports  = reportsRes.status === 'fulfilled' ? (reportsRes.value.count ?? 0) : 0;
      const cities   = locRes.status     === 'fulfilled' ? (locRes.value.count     ?? 0) : 0;
      const daysActive = createdAt
        ? Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000))
        : 1;
      setStats({ posts, reports, cities, daysActive });
      lastStatsRefreshAtRef.current = Date.now();
    })().finally(() => {
      statsRequestRef.current = null;
    });

    statsRequestRef.current = request;
    return request;
  };

  /* ── helpers Supabase ── */
  const upsertProfileRow = async (
    userId: string,
    payload: { name?: string | null; avatar_url?: string | null },
  ) => {
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, ...payload }, { onConflict: 'id' });
    if (error) throw error;
  };

  /* ── load profile ── */
  const loadProfile = async (existingSession?: any) => {
    try {
      const session = existingSession ?? await getSession();
      if (!session?.user) { setLoading(false); return; }

      const su = session.user as any;
      const fallback: User = {
        id:         su.id,
        email:      su.email,
        name:       su.user_metadata?.name ?? su.user_metadata?.full_name ?? '',
        avatar_url: su.user_metadata?.avatar_url ?? undefined,
        created_at: su.created_at,
      };
      setProfile(fallback);
      setName(fallback.name ?? '');
      setLoading(false);

      const res = await fetchProfileWithTimeout(`${API_URL}/profile`, {
        headers: { Authorization: `Bearer ${session.session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          const merged: User = {
            ...fallback, ...data.data,
            name:       data.data.name       ?? fallback.name       ?? '',
            email:      data.data.email      ?? fallback.email,
            avatar_url: data.data.avatar_url ?? fallback.avatar_url,
            created_at: data.data.created_at ?? fallback.created_at,
          };
          setProfile(merged);
          setName(merged.name ?? '');
        }
      }
    } catch (e) {
      console.warn('loadProfile', e);
    } finally {
      setLoading(false);
    }
  };

  /* ── save profile ── */
  const saveProfile = async () => {
    setSaving(true);
    try {
      const session = await getSession();
      if (!session?.session || !session.user?.id) return;
      const nextName = name.trim() || null;
      const res = await fetch(`${API_URL}/profile`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: nextName }),
      });
      if (!res.ok) throw new Error();
      await upsertProfileRow(session.user.id, { name: nextName });
      setEditing(false);
      void loadProfile();
    } catch {
      Alert.alert('Error', 'No se pudo guardar el perfil. Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  /* ── pick + upload avatar ── */
  const pickAndUploadAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para cambiar la foto.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      const session = await getSession();
      if (!session?.user) throw new Error('Sin sesión');
      const userId = (session.user as any).id as string;
      const filePath = `${userId}/avatar.${ext}`;

      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const fileBody = decode(base64);

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(filePath, fileBody, { upsert: true, contentType: normalizeContentType(ext) });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } });
      await upsertProfileRow(userId, { avatar_url: avatarUrl });
      setProfile(p => p ? { ...p, avatar_url: avatarUrl } : p);

      if (session.session) {
        await fetch(`${API_URL}/profile`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ avatar_url: avatarUrl }),
        }).catch(() => {});
      }
    } catch {
      Alert.alert('Error', 'No se pudo subir la foto. Intenta de nuevo.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleLogout = async () => {
    try { await signOut(); } catch { /* ignorar */ }
    await clearToken();
    router.replace('/login');
  };

  const openEditPanel = () => {
    setEditing(true);
    setName(profile?.name ?? '');
  };

  const closeEditPanel = () => {
    setEditing(false);
    setName(profile?.name ?? '');
  };

  const closeAccountPanel = () => setAccountPanel(null);

  const persistPreferences = async (next: AccountPreferences) => {
    try {
      await AsyncStorage.setItem(ACCOUNT_PREFS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Best-effort local preferences; the UI should still respond instantly.
    }
  };

  const togglePreference = (key: PreferenceKey) => {
    setPreferences((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      void persistPreferences(next);
      return next;
    });
  };

  const resetPreferences = () => {
    Alert.alert('Restablecer ajustes', 'Volver a la configuracion recomendada de CliMax?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Restablecer',
        onPress: () => {
          setPreferences(DEFAULT_ACCOUNT_PREFERENCES);
          void persistPreferences(DEFAULT_ACCOUNT_PREFERENCES);
        },
      },
    ]);
  };

  const clearLocalPreferences = () => {
    Alert.alert('Limpiar preferencias locales', 'Se borraran ajustes guardados solo en este dispositivo.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Limpiar',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem(ACCOUNT_PREFS_STORAGE_KEY).catch(() => {});
          setPreferences(DEFAULT_ACCOUNT_PREFERENCES);
          Alert.alert('Listo', 'Preferencias locales limpiadas.');
        },
      },
    ]);
  };

  const goToPasswordChange = () => {
    setAccountPanel(null);
    router.push('/reset-password' as any);
  };

  /* ── derived ── */
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    : null;
  const displayInitial =
    (profile?.name?.trim()?.charAt(0) || profile?.email?.charAt(0) || '?').toUpperCase();

  /* ═══════════════ LOADING ═══════════════ */
  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <StatusBar barStyle={scene.ink === 'dark' ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
        <WeatherSceneBackground code={weatherCode} isNight={isNight} particlesEnabled={!preferences.dataSaver} />
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  /* ═══════════════ GUEST ═══════════════ */
  if (!profile) {
    return (
      <View style={s.guestScreen}>
        <StatusBar barStyle={scene.ink === 'dark' ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
        <AuthWeatherBubbles />
        <View style={s.guestGlow1} />
        <View style={s.guestGlow2} />
        <GaruaRainOverlay />
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={{ zIndex: 2 }}
          contentContainerStyle={[s.guestScroll, { paddingTop: insets.top + 20 }]}
        >
          <View style={s.guestIconWrap}>
            <Ionicons name="person-circle-outline" size={88} color="rgba(148,163,184,0.55)" />
          </View>
          <View style={s.guestTextWrap}>
            <Text style={s.guestTitle}>Tu perfil te espera</Text>
            <Text style={s.guestSubtitle}>
              Inicia sesión para ver y gestionar tu cuenta, o crea una nueva si eres usuario nuevo.
            </Text>
          </View>
          <View style={s.guestCard}>
            <View style={s.guestOption}>
              <Text style={s.guestOptionTitle}>¿Ya tienes cuenta?</Text>
              <Text style={s.guestOptionDesc}>
                Inicia sesión con tu correo y contraseña para acceder a tu perfil.
              </Text>
              <Pressable
                style={({ pressed }) => [s.guestBtnPrimary, pressed && { opacity: 0.85 }]}
                onPress={() => router.push('/login')}
              >
                <Text style={s.guestBtnPrimaryText}>Iniciar sesión</Text>
              </Pressable>
            </View>
            <View style={s.guestDivider}>
              <View style={s.guestDividerLine} />
              <Text style={s.guestDividerText}>o</Text>
              <View style={s.guestDividerLine} />
            </View>
            <View style={s.guestOption}>
              <Text style={s.guestOptionTitle}>¿Eres nuevo?</Text>
              <Text style={s.guestOptionDesc}>
                Crea una cuenta gratis para guardar ciudades y personalizar la app.
              </Text>
              <Pressable
                style={({ pressed }) => [s.guestBtnOutline, pressed && { opacity: 0.85 }]}
                onPress={() => router.push('/register')}
              >
                <Text style={s.guestBtnOutlineText}>Crear cuenta</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  /* ═══════════════ PROFILE ═══════════════ */
  const STAT_ITEMS = [
    { value: stats.posts,      label: 'PUBLICACIONES', icon: 'newspaper-outline'      as const },
    { value: stats.reports,    label: 'REPORTES',      icon: 'warning-outline'         as const },
    { value: stats.cities,     label: 'UBICACIONES',   icon: 'location-outline'        as const },
    { value: stats.daysActive, label: 'DÍAS ACTIVO',   icon: 'calendar-outline'        as const },
  ];
  return (
    <View style={s.container}>
      <StatusBar barStyle={scene.ink === 'dark' ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
      <WeatherSceneBackground code={weatherCode} isNight={isNight} particlesEnabled={!preferences.dataSaver} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          s.scroll,
          { paddingTop: insets.top + 14, paddingBottom: Math.max(insets.bottom, 16) + 132 },
        ]}
      >

        {/* ═══ HERO CARD (vista compacta — edición dentro del panel) ═══ */}
        <View style={s.heroCard}>
          <View style={s.avatarRing}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={s.avatar} />
            ) : (
              <View style={s.avatarFallback}>
                <Text style={s.avatarInitial}>{displayInitial}</Text>
              </View>
            )}
          </View>

          <Text style={s.heroName}>{profile.name || 'Sin nombre'}</Text>
          <Text style={s.heroEmail} numberOfLines={1}>{profile.email ?? ''}</Text>

          {memberSince ? (
            <View style={s.memberBadge}>
              <Ionicons name="time-outline" size={13} color={ACCENT} />
              <Text style={s.memberBadgeText}>Miembro desde {memberSince}</Text>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              editing ? s.btnGhost : s.btnPrimary,
              { marginTop: 8 },
              pressed && { opacity: 0.85 },
            ]}
            onPress={editing ? closeEditPanel : openEditPanel}
          >
            {editing ? (
              <>
                <Ionicons name="chevron-up" size={16} color="#1b2027" style={{ marginRight: 8 }} />
                <Text style={s.btnGhostText}>Ocultar edición</Text>
              </>
            ) : (
              <>
                <Ionicons name="pencil" size={15} color={ACCENT_DK} style={{ marginRight: 6 }} />
                <Text style={s.btnPrimaryText}>Editar perfil</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* ═══ STATS GRID ═══ */}
        <View style={s.statsGrid}>
          {STAT_ITEMS.map(item => (
            <View key={item.label} style={s.statCard}>
              <View style={s.statIconWrap}>
                <Ionicons name={item.icon} size={20} color={ACCENT} />
              </View>
              <Text style={s.statValue}>{item.value.toLocaleString('es-ES')}</Text>
              <Text style={s.statLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
        {/* CUENTA ═══ */}
        <View style={s.sectionBlock}>
          <View style={s.sectionHeader}>
            <View style={s.sectionIconWrap}>
              <Ionicons name="settings-outline" size={18} color={ACCENT} />
            </View>
            <View>
              <Text style={s.sectionEyebrow}>Preferencias</Text>
              <Text style={s.sectionTitle}>Cuenta</Text>
            </View>
          </View>
          <View style={s.glassCard}>
            <Pressable
              style={({ pressed }) => [s.menuRow, pressed && s.menuRowPressed]}
              onPress={() => router.push('/(tabs)/subscriptions' as any)}
            >
              <View style={s.menuIconWrap}>
                <Ionicons name="star-outline" size={20} color="#1b2027" />
              </View>
              <Text style={s.menuLabel}>Suscripción</Text>
              <Ionicons name="chevron-forward" size={20} color="rgba(27,32,39,0.28)" />
            </Pressable>
            <View style={s.menuDivider} />
            <Pressable
              style={({ pressed }) => [s.menuRow, pressed && s.menuRowPressed]}
              onPress={() => setAccountPanel('preferences')}
            >
              <View style={s.menuIconWrap}>
                <Ionicons name="settings-outline" size={20} color="#1b2027" />
              </View>
              <Text style={s.menuLabel}>Ajustes</Text>
              <Ionicons name="chevron-forward" size={20} color="rgba(27,32,39,0.28)" />
            </Pressable>
            <View style={s.menuDivider} />
            <Pressable
              style={({ pressed }) => [s.menuRow, pressed && s.menuRowPressed]}
              onPress={() => setAccountPanel('security')}
            >
              <View style={s.menuIconWrap}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#1b2027" />
              </View>
              <Text style={s.menuLabel}>Seguridad y privacidad</Text>
              <Ionicons name="chevron-forward" size={20} color="rgba(27,32,39,0.28)" />
            </Pressable>
            <View style={s.logoutDivider} />
            <Pressable
              style={({ pressed }) => [s.menuRow, s.menuRowLogout, pressed && s.menuRowPressed]}
              onPress={handleLogout}
            >
              <View style={[s.menuIconWrap, s.menuIconWrapDanger]}>
                <Ionicons name="log-out-outline" size={20} color={premiumColors.danger} />
              </View>
              <Text style={s.menuLabelDanger}>Cerrar sesión</Text>
              <Ionicons name="chevron-forward" size={20} color="rgba(182,67,44,0.3)" />
            </Pressable>
          </View>
        </View>

      </ScrollView>
      {/* Panel flotante “Tus datos” con blur */}
      <Modal
        animationType="fade"
        transparent
        visible={editing}
        onRequestClose={closeEditPanel}
        statusBarTranslucent
      >
        <View style={s.modalRoot}>
          <BlurView
            intensity={Platform.OS === 'ios' ? 42 : 32}
            tint="dark"
            style={[StyleSheet.absoluteFillObject, { zIndex: 0 }]}
          />

          {/* Velado suave encima del blur para contraste */}
          <View
            style={[StyleSheet.absoluteFillObject, s.modalTint, { zIndex: 0 }]}
          />

          <Pressable
            accessibilityRole="button"
            style={[StyleSheet.absoluteFillObject, s.modalBackdropPressable]}
            onPress={closeEditPanel}
          />

          <View
            style={[
              StyleSheet.absoluteFillObject,
              s.modalOverlay,
              {
                paddingTop: Math.max(insets.top, 12),
                paddingBottom: Math.max(insets.bottom, 12),
                paddingHorizontal: 20,
              },
            ]}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={insets.top + 8}
              style={s.modalKav}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
                style={s.modalScroll}
                contentContainerStyle={s.modalScrollContent}
              >
                <View style={[s.modalCardOuter, { maxHeight: Dimensions.get('window').height * 0.88 }]}>
                <View style={s.editPanelHeader}>
                  <View style={s.sectionIconWrap}>
                    <Ionicons name="id-card-outline" size={18} color={ACCENT} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.sectionEyebrow}>Tu cuenta</Text>
                    <Text style={s.sectionTitle}>Tus datos</Text>
                  </View>
                  <Pressable
                    hitSlop={12}
                    onPress={closeEditPanel}
                    style={({ pressed }) => [s.modalCloseBtn, pressed && { opacity: 0.7 }]}
                    accessibilityLabel="Cerrar"
                  >
                    <Ionicons name="close" size={22} color="rgba(27,32,39,0.85)" />
                  </Pressable>
                </View>

                <Text style={s.editHint}>
                  Puedes cambiar la foto y el nombre. El correo solo se muestra; la fecha de registro no se puede modificar.
                </Text>

                <View style={s.editPhotoSection}>
                  <Pressable
                    onPress={pickAndUploadAvatar}
                    disabled={uploadingAvatar}
                    style={({ pressed }) => [
                      s.editAvatarRing,
                      pressed && { opacity: 0.85 },
                      uploadingAvatar && { opacity: 0.65 },
                    ]}
                  >
                    {profile.avatar_url ? (
                      <Image source={{ uri: profile.avatar_url }} style={s.editAvatar} />
                    ) : (
                      <View style={[s.avatarFallback, { width: 88, height: 88, borderRadius: 44 }]}>
                        <Text style={[s.avatarInitial, { fontSize: 34 }]}>{displayInitial}</Text>
                      </View>
                    )}
                    <View style={s.avatarEditBadge}>
                      {uploadingAvatar
                        ? <ActivityIndicator size={16} color="#fff" />
                        : <Ionicons name="camera" size={15} color="#fff" />}
                    </View>
                  </Pressable>
                  <Text style={s.editPhotoLabel}>Toca la foto para cambiarla</Text>
                </View>

                <View style={s.editFieldBlock}>
                  <Text style={s.editFieldLabel}>Nombre</Text>
                  <TextInput
                    style={s.editNameInput}
                    value={name}
                    onChangeText={setName}
                    placeholder="Tu nombre visible"
                    placeholderTextColor="rgba(27,32,39,0.32)"
                    selectionColor={ACCENT}
                  />
                </View>

                <View style={s.editStaticBlock}>
                  <View style={s.editStaticHeader}>
                    <Ionicons name="mail-outline" size={17} color="rgba(226,98,43,0.85)" />
                    <Text style={s.editStaticLabel}>Correo</Text>
                  </View>
                  <Text style={s.editStaticValue} numberOfLines={2}>{profile.email || '—'}</Text>
                </View>

                <View style={[s.editStaticBlock, { borderBottomWidth: 0 }]}>
                  <View style={s.editStaticHeader}>
                    <Ionicons name="calendar-outline" size={17} color="rgba(226,98,43,0.85)" />
                    <Text style={s.editStaticLabel}>Miembro desde</Text>
                  </View>
                  <Text style={s.editStaticValueMuted}>{memberSince ?? '—'}</Text>
                </View>

                <View style={s.editPanelActions}>
                  <Pressable
                    style={({ pressed }) => [s.btnPrimary, s.editPanelBtn, pressed && { opacity: 0.85 }]}
                    onPress={saveProfile}
                    disabled={saving}
                  >
                    <Text style={s.btnPrimaryText}>{saving ? 'Guardando…' : 'Guardar cambios'}</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [s.btnGhost, s.editPanelBtn, pressed && { opacity: 0.85 }]}
                    onPress={closeEditPanel}
                  >
                    <Text style={s.btnGhostText}>Cancelar</Text>
                  </Pressable>
                </View>
              </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={accountPanel !== null}
        onRequestClose={closeAccountPanel}
        statusBarTranslucent
      >
        <View style={s.modalRoot}>
          <BlurView
            intensity={Platform.OS === 'ios' ? 42 : 32}
            tint="dark"
            style={[StyleSheet.absoluteFillObject, { zIndex: 0 }]}
          />
          <View style={[StyleSheet.absoluteFillObject, s.modalTint, { zIndex: 0 }]} />
          <Pressable
            accessibilityRole="button"
            style={[StyleSheet.absoluteFillObject, s.modalBackdropPressable]}
            onPress={closeAccountPanel}
          />

          <View
            style={[
              StyleSheet.absoluteFillObject,
              s.modalOverlay,
              {
                paddingTop: Math.max(insets.top, 12),
                paddingBottom: Math.max(insets.bottom, 12),
                paddingHorizontal: 20,
              },
            ]}
          >
            <View style={s.accountPanelCard}>
              <View style={s.editPanelHeader}>
                <View style={s.sectionIconWrap}>
                  <Ionicons
                    name={accountPanel === 'security' ? 'shield-checkmark-outline' : 'settings-outline'}
                    size={18}
                    color={ACCENT}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.sectionEyebrow}>
                    {accountPanel === 'security' ? 'Control de datos' : 'Experiencia'}
                  </Text>
                  <Text style={s.sectionTitle}>
                    {accountPanel === 'security' ? 'Seguridad y privacidad' : 'Ajustes de cuenta'}
                  </Text>
                </View>
                <Pressable
                  hitSlop={12}
                  onPress={closeAccountPanel}
                  style={({ pressed }) => [s.modalCloseBtn, pressed && { opacity: 0.7 }]}
                  accessibilityLabel="Cerrar"
                >
                  <Ionicons name="close" size={22} color="rgba(27,32,39,0.85)" />
                </Pressable>
              </View>

              {accountPanel === 'preferences' ? (
                <>
                  <Text style={s.editHint}>
                    Personaliza como CliMax te avisa y cuanto consume en este dispositivo.
                  </Text>
                  <View style={s.accountPanelGroup}>
                    <PreferenceToggle
                      icon="chatbubble-ellipses-outline"
                      title="Menciones de comunidad"
                      description="Recibe avisos cuando interactuen con tus reportes."
                      value={preferences.communityMentions}
                      onToggle={() => togglePreference('communityMentions')}
                    />
                    <PreferenceToggle
                      icon="calendar-outline"
                      title="Resumen semanal"
                      description="Un resumen compacto de actividad, alertas y ciudades."
                      value={preferences.weeklySummary}
                      onToggle={() => togglePreference('weeklySummary')}
                    />
                    <PreferenceToggle
                      icon="cellular-outline"
                      title="Ahorro de datos"
                      description="Reduce cargas visuales cuando la conexion este lenta."
                      value={preferences.dataSaver}
                      onToggle={() => togglePreference('dataSaver')}
                    />
                  </View>
                  <Pressable
                    style={({ pressed }) => [s.panelActionBtn, pressed && { opacity: 0.86 }]}
                    onPress={resetPreferences}
                  >
                    <Ionicons name="refresh-outline" size={18} color={ACCENT} />
                    <Text style={s.panelActionText}>Restablecer ajustes recomendados</Text>
                  </Pressable>
                </>
              ) : null}

              {accountPanel === 'security' ? (
                <>
                  <Text style={s.editHint}>
                    Administra tu acceso, visibilidad y datos locales guardados en este telefono.
                  </Text>
                  <View style={s.securitySummaryCard}>
                    <View style={s.securitySummaryIcon}>
                      <Ionicons name="mail-outline" size={20} color={ACCENT} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.securitySummaryLabel}>Correo de acceso</Text>
                      <Text style={s.securitySummaryValue} numberOfLines={1}>{profile.email ?? 'Sin correo'}</Text>
                    </View>
                  </View>

                  <View style={s.accountPanelGroup}>
                    <PreferenceToggle
                      icon="navigate-outline"
                      title="Ubicacion precisa en reportes"
                      description="Permite usar coordenadas precisas al crear reportes."
                      value={preferences.preciseLocation}
                      onToggle={() => togglePreference('preciseLocation')}
                    />
                  </View>

                  <View style={s.accountPanelGroup}>
                    <PanelActionRow
                      icon="key-outline"
                      title="Cambiar contrasena"
                      description="Actualiza tu clave desde una sesion activa."
                      onPress={goToPasswordChange}
                    />
                    <PanelActionRow
                      icon="trash-outline"
                      title="Limpiar preferencias locales"
                      description="Borra ajustes guardados solo en este dispositivo."
                      onPress={clearLocalPreferences}
                    />
                    <PanelActionRow
                      icon="log-out-outline"
                      title="Cerrar sesion"
                      description="Salir de CliMax en este dispositivo."
                      danger
                      onPress={handleLogout}
                    />
                  </View>
                </>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function PreferenceToggle({
  icon,
  title,
  description,
  value,
  onToggle,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [s.preferenceRow, pressed && s.menuRowPressed]} onPress={onToggle}>
      <View style={s.preferenceIcon}>
        <Ionicons name={icon} size={19} color={ACCENT} />
      </View>
      <View style={s.preferenceCopy}>
        <Text style={s.preferenceTitle}>{title}</Text>
        <Text style={s.preferenceDescription}>{description}</Text>
      </View>
      <Switch
        pointerEvents="none"
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: 'rgba(148,163,184,0.28)', true: `${ACCENT}80` }}
        thumbColor={value ? premiumColors.accentSoft : '#cbd5e1'}
      />
    </Pressable>
  );
}

function PanelActionRow({
  icon,
  title,
  description,
  danger,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [s.preferenceRow, pressed && s.menuRowPressed]} onPress={onPress}>
      <View style={[s.preferenceIcon, danger && s.menuIconWrapDanger]}>
        <Ionicons name={icon} size={19} color={danger ? premiumColors.danger : ACCENT} />
      </View>
      <View style={s.preferenceCopy}>
        <Text style={[s.preferenceTitle, danger && { color: premiumColors.danger }]}>{title}</Text>
        <Text style={s.preferenceDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="rgba(27,32,39,0.4)" />
    </Pressable>
  );
}

/* ── util ── */
function normalizeContentType(extRaw: string): string {
  const ext = extRaw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png')  return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/* ═══════════════════════════════════════════
   Styles
═══════════════════════════════════════════ */
const STAT_W = (SW - 40 - 10) / 2;

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: SURFACE, overflow: 'hidden' },
  /** Invitado: mismo fondo que login + burbujas/garúa */
  guestScreen:     { flex: 1, backgroundColor: premiumColors.surface, overflow: 'hidden' },
  guestGlow1: {
    position: 'absolute',
    top: -120,
    left: -100,
    width: 400,
    height: 400,
    borderRadius: 999,
    backgroundColor: premiumColors.auroraAqua,
    zIndex: 0,
    pointerEvents: 'none',
  },
  guestGlow2: {
    position: 'absolute',
    bottom: -80,
    right: -80,
    width: 300,
    height: 300,
    borderRadius: 999,
    backgroundColor: premiumColors.auroraTeal,
    zIndex: 0,
    pointerEvents: 'none',
  },
  loadingContainer:{ flex: 1, backgroundColor: SURFACE, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },

  scroll: { paddingHorizontal: 20, gap: 20 },

  /* ── Hero ── */
  heroCard: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 28, borderWidth: 1,
    borderColor: `${ACCENT}38`,
    paddingVertical: 30, paddingHorizontal: 20,
    alignItems: 'center', gap: 10,
    ...premiumShadow('strong'),
  },
  avatarRing: {
    width: 112, height: 112, borderRadius: 56,
    borderWidth: 2.5, borderColor: `${ACCENT}80`,
    padding: 3, backgroundColor: 'rgba(226,98,43,0.1)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 2,
  },
  avatar:        { width: 100, height: 100, borderRadius: 50 },
  avatarFallback:{ width: 100, height: 100, borderRadius: 50, backgroundColor: `${ACCENT}2e`, justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontSize: 38, fontWeight: '700', color: ACCENT },
  avatarEditBadge: {
    position: 'absolute', bottom: 3, right: 3,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(12,18,34,0.95)',
    borderWidth: 1.5, borderColor: `${ACCENT}80`,
    justifyContent: 'center', alignItems: 'center',
  },
  heroName:  { fontSize: 24, fontWeight: '700', color: premiumColors.ink, letterSpacing: -0.3, textAlign: 'center' },
  heroEmail: { fontSize: 13, color: 'rgba(148,163,184,0.9)', textAlign: 'center' },
  memberBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: `${ACCENT}1a`,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999, borderWidth: 1,
    borderColor: `${ACCENT}3d`, marginTop: 2,
  },
  memberBadgeText: { fontSize: 12, fontWeight: '600', color: premiumColors.inkMuted },
  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: ACCENT, borderRadius: 14,
    paddingHorizontal: 22, paddingVertical: 11, minHeight: 44,
  },
  btnPrimaryText: { color: ACCENT_DK, fontWeight: '700', fontSize: 14 },
  btnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(27,32,39,0.05)', borderRadius: 14,
    borderWidth: 1, borderColor: GLASS_BD,
    paddingHorizontal: 20, paddingVertical: 11,
    minHeight: 44,
  },
  btnGhostText: { color: premiumColors.inkMuted, fontWeight: '600', fontSize: 14 },

  /* ── Modal flotante “Tus datos” ── */
  modalRoot: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  modalTint: {
    backgroundColor: 'rgba(2,6,18,0.38)',
    pointerEvents: 'none',
  },
  modalBackdropPressable: {
    zIndex: 1,
  },
  modalOverlay: {
    zIndex: 2,
    justifyContent: 'center',
    alignItems: 'stretch',
    pointerEvents: 'box-none',
  },
  modalKav: {
    width: '100%',
    maxHeight: Dimensions.get('window').height * 0.92,
    alignSelf: 'center',
  },
  modalScroll: {
    width: '100%',
  },
  modalScrollContent: {
    flexGrow: 0,
    paddingVertical: 4,
  },
  modalCardOuter: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: `${ACCENT}47`,
    padding: 18,
    gap: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.45,
    shadowRadius: 30,
    ...Platform.select({ ios: { elevation: 22 }, android: { elevation: 6 } }),
  },
  modalCloseBtn: {
    padding: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(27,32,39,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(27,32,39,0.08)',
    marginLeft: 8,
  },
  editPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: -4,
  },
  editHint: {
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(148,163,184,0.88)',
    marginTop: -2,
  },
  editPhotoSection: {
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GLASS_BD,
    marginHorizontal: -4,
    paddingHorizontal: 4,
    paddingBottom: 16,
  },
  editAvatarRing: {
    position: 'relative',
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 2,
    borderColor: `${ACCENT}73`,
    padding: 3,
    backgroundColor: 'rgba(226,98,43,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: 'rgba(27,32,39,0.12)',
  },
  editPhotoLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(148,163,184,0.75)',
  },
  editFieldBlock: { gap: 8 },
  editFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.45,
    color: 'rgba(148,163,184,0.88)',
    textTransform: 'uppercase',
  },
  editNameInput: {
    backgroundColor: 'rgba(27,32,39,0.05)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(27,32,39,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    color: premiumColors.ink,
  },
  editStaticBlock: {
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(27,32,39,0.08)',
    marginHorizontal: -2,
    paddingHorizontal: 2,
    paddingBottom: 12,
  },
  editStaticHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editStaticLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.45,
    color: 'rgba(148,163,184,0.88)',
    textTransform: 'uppercase',
  },
  editStaticValue: {
    fontSize: 15,
    fontWeight: '600',
    color: premiumColors.ink,
    paddingLeft: 25,
  },
  editStaticValueMuted: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(148,163,184,0.55)',
    fontStyle: 'italic',
    paddingLeft: 25,
  },
  editPanelActions: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 10,
    marginTop: 4,
    justifyContent: 'flex-start',
  },
  editPanelBtn: {
    flexGrow: 0,
    flexShrink: 0,
  },

  /* ── Stats ── */
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    width: STAT_W,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 22, borderWidth: 1,
    borderColor: `${ACCENT}29`,
    paddingVertical: 18, paddingHorizontal: 12,
    alignItems: 'center', gap: 6,
    ...premiumShadow('medium'),
  },
  statIconWrap: {
    width: 42, height: 42, borderRadius: 13,
    backgroundColor: `${ACCENT}1f`,
    borderWidth: 1, borderColor: `${ACCENT}38`,
    justifyContent: 'center', alignItems: 'center', marginBottom: 2,
  },
  statValue: { fontSize: 28, fontWeight: '800', color: premiumColors.ink, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(148,163,184,0.8)', textAlign: 'center', letterSpacing: 0.4 },

  /* ── Sections ── */
  sectionBlock: { gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 2 },
  sectionIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: `${ACCENT}1f`,
    borderWidth: 1, borderColor: `${ACCENT}40`,
    justifyContent: 'center', alignItems: 'center',
  },
  sectionEyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: 'rgba(148,163,184,0.75)', textTransform: 'uppercase' },
  sectionTitle:   { fontSize: 17, fontWeight: '700', color: premiumColors.ink, marginTop: 2 },
  viewAllBtn:     { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAllText:    { fontSize: 13, fontWeight: '600', color: ACCENT },

  /* ── Posts ── */
  postsLoadingWrap:  { height: 80, justifyContent: 'center', alignItems: 'center' },
  postsEmptyCard: {
    backgroundColor: GLASS_BG, borderRadius: 22,
    borderWidth: 1, borderColor: GLASS_BD,
    paddingVertical: 36, paddingHorizontal: 24,
    alignItems: 'center', gap: 12,
  },
  postsEmptyTitle: { fontSize: 16, fontWeight: '700', color: premiumColors.ink, textAlign: 'center' },
  postsEmptyDesc:  { fontSize: 13, color: 'rgba(148,163,184,0.75)', textAlign: 'center', lineHeight: 20 },

  postCard: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 22, borderWidth: 1,
    borderColor: 'rgba(27,32,39,0.1)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16,
    ...Platform.select<ViewStyle>({
      ios: { elevation: 5 },
      android: { elevation: 0 },
    }),
  },
  postCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.995 }],
  },
  postImageWrap:    { width: '100%', height: 180, position: 'relative' },
  postImage:        { width: '100%', height: '100%' },
  postTimeBadge: {
    position: 'absolute', top: 14, left: 14,
    backgroundColor: 'rgba(12,18,34,0.70)',
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 999, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  postTimeBadgeText: { fontSize: 12, fontWeight: '600', color: '#fdf9f3' },
  postNoImageHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4,
  },
  postTimeBadgeNoImg: { fontSize: 12, fontWeight: '600', color: 'rgba(148,163,184,0.8)' },
  postBody:    { padding: 16, gap: 12 },
  postContent: { fontSize: 15, fontWeight: '500', color: premiumColors.inkMuted, lineHeight: 22 },
  postFooter:  { flexDirection: 'row', alignItems: 'center', gap: 16 },
  postStat:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  postStatText:{ fontSize: 13, fontWeight: '600', color: 'rgba(148,163,184,0.75)' },
  postsModalCard: {
    width: '100%',
    maxWidth: 460,
    maxHeight: Dimensions.get('window').height * 0.9,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: `${ACCENT}3d`,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.4,
    shadowRadius: 28,
    ...Platform.select({ ios: { elevation: 20 }, android: { elevation: 6 } }),
    gap: 12,
  },
  postsModalList: {
    gap: 14,
    paddingBottom: 6,
  },

  /* ── Glass Card ── */
  accountPanelCard: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 440,
    maxHeight: Dimensions.get('window').height * 0.9,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: `${ACCENT}47`,
    padding: 18,
    gap: 14,
    overflow: 'hidden',
    ...premiumShadow('strong'),
  },
  accountPanelGroup: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(27,32,39,0.1)',
    backgroundColor: 'rgba(27,32,39,0.035)',
    overflow: 'hidden',
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 13,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(27,32,39,0.08)',
  },
  preferenceIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: `${ACCENT}1a`,
    borderWidth: 1,
    borderColor: 'rgba(226,98,43,0.26)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  preferenceCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  preferenceTitle: {
    color: premiumColors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  preferenceDescription: {
    color: 'rgba(148,163,184,0.78)',
    fontSize: 12,
    lineHeight: 17,
  },
  panelActionBtn: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${ACCENT}42`,
    backgroundColor: `${ACCENT}14`,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  panelActionText: {
    color: ACCENT,
    fontSize: 13,
    fontWeight: '800',
  },
  securitySummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: `${ACCENT}33`,
    backgroundColor: `${ACCENT}14`,
    padding: 13,
  },
  securitySummaryIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: `${ACCENT}1f`,
    borderWidth: 1,
    borderColor: 'rgba(226,98,43,0.26)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  securitySummaryLabel: {
    color: 'rgba(148,163,184,0.82)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
  },
  securitySummaryValue: {
    color: premiumColors.ink,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 3,
  },
  glassCard: {
    backgroundColor: GLASS_BG, borderRadius: 22,
    borderWidth: 1, borderColor: GLASS_BD,
    paddingVertical: 6, paddingHorizontal: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22, shadowRadius: 20, ...Platform.select({ ios: { elevation: 6 }, android: { elevation: 3 } }),
  },

  /* ── Info rows ── */
  infoRow:      { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4 },
  infoIconBadge:{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${ACCENT}1a`, justifyContent: 'center', alignItems: 'center' },
  infoTextCol:  { flex: 1, minWidth: 0, gap: 4 },
  infoLabel:    { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, color: 'rgba(148,163,184,0.9)', textTransform: 'uppercase' },
  infoValue:    { fontSize: 15, fontWeight: '500', color: premiumColors.ink },
  separator:    { height: StyleSheet.hairlineWidth, backgroundColor: GLASS_BD, marginLeft: 54 },

  /* ── Menu rows ── */
  menuRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 6, borderRadius: 14, gap: 12 },
  menuRowLogout:   { marginTop: 2 },
  menuRowPressed:  { backgroundColor: 'rgba(27,32,39,0.045)' },
  menuIconWrap:    { width: 42, height: 42, borderRadius: 13, backgroundColor: 'rgba(27,32,39,0.045)', justifyContent: 'center', alignItems: 'center' },
  menuIconWrapDanger: { backgroundColor: 'rgba(239,68,68,0.12)' },
  menuLabel:       { flex: 1, fontSize: 15, fontWeight: '500', color: premiumColors.ink },
  menuLabelDanger: { flex: 1, fontSize: 15, fontWeight: '700', color: premiumColors.danger },
  menuDivider:     { height: StyleSheet.hairlineWidth, backgroundColor: GLASS_BD, marginLeft: 58 },
  logoutDivider:   { height: 1, backgroundColor: 'rgba(27,32,39,0.06)', marginVertical: 8, marginHorizontal: 4 },

  /* ── Guest ── */
  guestScroll:      { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40, gap: 28, zIndex: 2 },
  guestIconWrap:    { alignItems: 'center' },
  guestTextWrap:    { alignItems: 'center', gap: 10 },
  guestTitle:       { fontSize: 26, fontWeight: '800', color: premiumColors.ink, letterSpacing: -0.4, textAlign: 'center' },
  guestSubtitle:    { fontSize: 14, color: 'rgba(148,163,184,0.8)', textAlign: 'center', lineHeight: 21 },
  guestCard:        { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 28, borderWidth: 1, borderColor: GLASS_BD, padding: 24, gap: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.5, shadowRadius: 24, ...Platform.select({ ios: { elevation: 12 }, android: { elevation: 5 } }) },
  guestOption:      { gap: 8 },
  guestOptionTitle: { fontSize: 16, fontWeight: '700', color: premiumColors.ink },
  guestOptionDesc:  { fontSize: 13, color: 'rgba(148,163,184,0.75)', lineHeight: 19 },
  guestBtnPrimary:  { marginTop: 4, backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  guestBtnPrimaryText: { color: ACCENT_DK, fontSize: 15, fontWeight: '800' },
  guestBtnOutline:  { marginTop: 4, borderRadius: 16, borderWidth: 1.5, borderColor: `${ACCENT}80`, paddingVertical: 13, alignItems: 'center' },
  guestBtnOutlineText: { color: ACCENT, fontSize: 15, fontWeight: '700' },
  guestDivider:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  guestDividerLine: { flex: 1, height: 1, backgroundColor: GLASS_BD },
  guestDividerText: { color: 'rgba(148,163,184,0.5)', fontSize: 13 },
});
