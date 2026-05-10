import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { decode } from 'base64-arraybuffer';
import { clearToken } from '../../core/auth/authStorage';
import { getSession, signOut, supabase } from '../../core/auth/supabaseClient';
import type { User } from '../../types';

const { width: SW } = Dimensions.get('window');

const SURFACE   = '#0c1222';
const GLASS_BG  = 'rgba(255,255,255,0.08)';
const GLASS_BD  = 'rgba(255,255,255,0.14)';
const ACCENT    = '#38bdf8';
const ACCENT_DK = '#082f49';

/* ── helper: tiempo relativo ── */
function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)   return 'Hace un momento';
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `Hace ${Math.floor(diff / 86400)} días`;
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

type MyPost = {
  id: string;
  content: string;
  created_at: string;
  image_url?: string | null;
  commentsCount: number;
};

type Stats = { posts: number; reports: number; cities: number; daysActive: number };

/* ───────────────────────────────────────── */
export default function ProfileScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [profile,         setProfile]         = useState<User | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [editing,         setEditing]         = useState(false);
  const [name,            setName]            = useState('');
  const [saving,          setSaving]          = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [stats,           setStats]           = useState<Stats>({ posts: 0, reports: 0, cities: 0, daysActive: 0 });
  const [myPosts,         setMyPosts]         = useState<MyPost[]>([]);
  const [loadingPosts,    setLoadingPosts]    = useState(false);
  const [showAllPosts,    setShowAllPosts]    = useState(false);

  useEffect(() => { void bootstrap(); }, []);
  useFocusEffect(
    useCallback(() => {
      void refreshProfileActivity();
    }, [])
  );

  /* ── bootstrap ── */
  const bootstrap = async () => {
    const session = await getSession();
    if (!session?.user) { setLoading(false); return; }
    const userId = (session.user as any).id as string;
    const createdAt = (session.user as any).created_at as string | undefined;

    void loadStats(userId, createdAt);
    void loadMyPosts(userId);
    await loadProfile(session);
  };

  const refreshProfileActivity = async () => {
    const session = await getSession();
    if (!session?.user) return;
    const userId = (session.user as any).id as string;
    const createdAt = (session.user as any).created_at as string | undefined;
    void loadStats(userId, createdAt);
    void loadMyPosts(userId);
  };

  /* ── load stats ── */
  const loadStats = async (userId: string, createdAt?: string) => {
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
  };

  /* ── load my posts ── */
  const loadMyPosts = async (userId: string) => {
    setLoadingPosts(true);
    try {
      const { data: postsData } = await supabase
        .from('community_posts')
        .select('id, content, created_at, image_url')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!postsData?.length) { setMyPosts([]); return; }

      const ids = postsData.map((p: any) => p.id);
      const { data: commentsData } = await supabase
        .from('community_comments')
        .select('post_id')
        .in('post_id', ids);

      const countMap: Record<string, number> = {};
      (commentsData ?? []).forEach((c: any) => {
        countMap[c.post_id] = (countMap[c.post_id] ?? 0) + 1;
      });

      setMyPosts(postsData.map((p: any) => ({
        id:            p.id,
        content:       p.content ?? '',
        created_at:    p.created_at,
        image_url:     p.image_url ?? null,
        commentsCount: countMap[p.id] ?? 0,
      })));
    } catch (e) {
      console.warn('loadMyPosts', e);
    } finally {
      setLoadingPosts(false);
    }
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

      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      if (!apiUrl) return;

      const res = await fetch(`${apiUrl}/profile`, {
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
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const session = await getSession();
      if (!session?.session || !session.user?.id) return;
      const nextName = name.trim() || null;
      if (apiUrl) {
        const res = await fetch(`${apiUrl}/profile`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: nextName }),
        });
        if (!res.ok) throw new Error();
      }
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

      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      if (apiUrl && session.session) {
        await fetch(`${apiUrl}/profile`, {
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

  const openAllPostsModal = () => {
    if (myPosts.length >= 2) setShowAllPosts(true);
  };

  const closeAllPostsModal = () => {
    setShowAllPosts(false);
  };

  const goToCommunityPost = (postId: string) => {
    setShowAllPosts(false);
    router.push(`/(tabs)/community?postId=${encodeURIComponent(postId)}`);
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
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <View style={s.glow1} />
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  /* ═══════════════ GUEST ═══════════════ */
  if (!profile) {
    return (
      <View style={s.container}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <View style={s.glow1} />
        <View style={s.glow2} />
        <ScrollView
          showsVerticalScrollIndicator={false}
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
  const previewPosts = myPosts.slice(0, 2);

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={s.glow1} />
      <View style={s.glow2} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          s.scroll,
          { paddingTop: insets.top + 14, paddingBottom: Math.max(insets.bottom, 16) + 24 },
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
                <Ionicons name="chevron-up" size={16} color="#e2e8f0" style={{ marginRight: 8 }} />
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

        {/* ═══ MIS PUBLICACIONES ═══ */}
        <View style={s.sectionBlock}>
          <View style={s.sectionHeader}>
            <View style={s.sectionIconWrap}>
              <Ionicons name="newspaper-outline" size={18} color={ACCENT} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.sectionEyebrow}>Actividad</Text>
              <Text style={s.sectionTitle}>Mis publicaciones</Text>
            </View>
            {myPosts.length >= 2 && (
              <Pressable style={s.viewAllBtn} onPress={openAllPostsModal}>
                <Text style={s.viewAllText}>Ver todas</Text>
                <Ionicons name="chevron-forward" size={16} color={ACCENT} />
              </Pressable>
            )}
          </View>

          {loadingPosts ? (
            <View style={s.postsLoadingWrap}>
              <ActivityIndicator size="small" color={ACCENT} />
            </View>
          ) : myPosts.length === 0 ? (
            <View style={s.postsEmptyCard}>
              <Ionicons name="cloud-upload-outline" size={40} color="rgba(56,189,248,0.35)" />
              <Text style={s.postsEmptyTitle}>Sin publicaciones aún</Text>
              <Text style={s.postsEmptyDesc}>
                Comparte una observación del clima en la comunidad y aparecerá aquí.
              </Text>
            </View>
          ) : (
            previewPosts.map(post => (
              <Pressable
                key={post.id}
                style={({ pressed }) => [s.postCard, pressed && s.postCardPressed]}
                onPress={() => goToCommunityPost(post.id)}
              >
                {post.image_url ? (
                  <View style={s.postImageWrap}>
                    <Image
                      source={{ uri: post.image_url }}
                      style={s.postImage}
                      resizeMode="cover"
                    />
                    <View style={s.postTimeBadge}>
                      <Text style={s.postTimeBadgeText}>{timeAgo(post.created_at)}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={s.postNoImageHeader}>
                    <Ionicons name="cloud-outline" size={22} color="rgba(56,189,248,0.45)" />
                    <Text style={s.postTimeBadgeNoImg}>{timeAgo(post.created_at)}</Text>
                  </View>
                )}
                <View style={s.postBody}>
                  <Text style={s.postContent} numberOfLines={3}>{post.content}</Text>
                  <View style={s.postFooter}>
                    <View style={s.postStat}>
                      <Ionicons name="chatbubble-outline" size={16} color="rgba(148,163,184,0.75)" />
                      <Text style={s.postStatText}>{post.commentsCount}</Text>
                    </View>
                    {!post.image_url && (
                      <View style={s.postStat}>
                        <Ionicons name="image-outline" size={16} color="rgba(148,163,184,0.4)" />
                        <Text style={[s.postStatText, { opacity: 0.5 }]}>Sin imagen</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            ))
          )}
        </View>

        {/* ═══ CUENTA ═══ */}
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
              onPress={() => {}}
            >
              <View style={s.menuIconWrap}>
                <Ionicons name="settings-outline" size={20} color="#e2e8f0" />
              </View>
              <Text style={s.menuLabel}>Ajustes</Text>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.28)" />
            </Pressable>
            <View style={s.menuDivider} />
            <Pressable style={({ pressed }) => [s.menuRow, pressed && s.menuRowPressed]}>
              <View style={s.menuIconWrap}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#e2e8f0" />
              </View>
              <Text style={s.menuLabel}>Seguridad y privacidad</Text>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.28)" />
            </Pressable>
            <View style={s.logoutDivider} />
            <Pressable
              style={({ pressed }) => [s.menuRow, s.menuRowLogout, pressed && s.menuRowPressed]}
              onPress={handleLogout}
            >
              <View style={[s.menuIconWrap, s.menuIconWrapDanger]}>
                <Ionicons name="log-out-outline" size={20} color="#fecaca" />
              </View>
              <Text style={s.menuLabelDanger}>Cerrar sesión</Text>
              <Ionicons name="chevron-forward" size={20} color="rgba(254,202,202,0.3)" />
            </Pressable>
          </View>
        </View>

      </ScrollView>

      {/* Modal grande: todas las publicaciones del usuario */}
      <Modal
        animationType="fade"
        transparent
        visible={showAllPosts}
        onRequestClose={closeAllPostsModal}
        statusBarTranslucent
      >
        <View style={s.modalRoot}>
          <BlurView
            intensity={Platform.OS === 'ios' ? 38 : 26}
            tint="dark"
            style={[StyleSheet.absoluteFillObject, { zIndex: 0 }]}
          />
          <View style={[StyleSheet.absoluteFillObject, s.modalTint, { zIndex: 0 }]} />
          <Pressable
            accessibilityRole="button"
            style={[StyleSheet.absoluteFillObject, s.modalBackdropPressable]}
            onPress={closeAllPostsModal}
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
            <View style={s.postsModalCard}>
              <View style={s.editPanelHeader}>
                <View style={s.sectionIconWrap}>
                  <Ionicons name="newspaper-outline" size={18} color={ACCENT} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.sectionEyebrow}>Actividad</Text>
                  <Text style={s.sectionTitle}>Todas mis publicaciones</Text>
                </View>
                <Pressable
                  hitSlop={12}
                  onPress={closeAllPostsModal}
                  style={({ pressed }) => [s.modalCloseBtn, pressed && { opacity: 0.7 }]}
                  accessibilityLabel="Cerrar"
                >
                  <Ionicons name="close" size={22} color="rgba(226,232,240,0.9)" />
                </Pressable>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={s.postsModalList}
              >
                {myPosts.map(post => (
                  <Pressable
                    key={post.id}
                    style={({ pressed }) => [s.postCard, pressed && s.postCardPressed]}
                    onPress={() => goToCommunityPost(post.id)}
                  >
                    {post.image_url ? (
                      <View style={s.postImageWrap}>
                        <Image source={{ uri: post.image_url }} style={s.postImage} resizeMode="cover" />
                        <View style={s.postTimeBadge}>
                          <Text style={s.postTimeBadgeText}>{timeAgo(post.created_at)}</Text>
                        </View>
                      </View>
                    ) : (
                      <View style={s.postNoImageHeader}>
                        <Ionicons name="cloud-outline" size={22} color="rgba(56,189,248,0.45)" />
                        <Text style={s.postTimeBadgeNoImg}>{timeAgo(post.created_at)}</Text>
                      </View>
                    )}
                    <View style={s.postBody}>
                      <Text style={s.postContent} numberOfLines={3}>{post.content}</Text>
                      <View style={s.postFooter}>
                        <View style={s.postStat}>
                          <Ionicons name="chatbubble-outline" size={16} color="rgba(148,163,184,0.75)" />
                          <Text style={s.postStatText}>{post.commentsCount}</Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

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
                    <Ionicons name="close" size={22} color="rgba(226,232,240,0.9)" />
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
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    selectionColor={ACCENT}
                  />
                </View>

                <View style={s.editStaticBlock}>
                  <View style={s.editStaticHeader}>
                    <Ionicons name="mail-outline" size={17} color="rgba(56,189,248,0.85)" />
                    <Text style={s.editStaticLabel}>Correo</Text>
                  </View>
                  <Text style={s.editStaticValue} numberOfLines={2}>{profile.email || '—'}</Text>
                </View>

                <View style={[s.editStaticBlock, { borderBottomWidth: 0 }]}>
                  <View style={s.editStaticHeader}>
                    <Ionicons name="calendar-outline" size={17} color="rgba(56,189,248,0.85)" />
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
    </View>
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
  loadingContainer:{ flex: 1, backgroundColor: SURFACE, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },

  glow1: { position: 'absolute', top: -100, left: -100, width: 340, height: 340, borderRadius: 999, backgroundColor: 'rgba(2,87,129,0.28)' },
  glow2: { position: 'absolute', bottom: -60, right: -80, width: 280, height: 280, borderRadius: 999, backgroundColor: 'rgba(56,189,248,0.11)' },

  scroll: { paddingHorizontal: 20, gap: 20 },

  /* ── Hero ── */
  heroCard: {
    backgroundColor: 'rgba(15,23,42,0.78)',
    borderRadius: 28, borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.22)',
    paddingVertical: 30, paddingHorizontal: 20,
    alignItems: 'center', gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.32, shadowRadius: 26, elevation: 10,
  },
  avatarRing: {
    width: 112, height: 112, borderRadius: 56,
    borderWidth: 2.5, borderColor: 'rgba(56,189,248,0.5)',
    padding: 3, backgroundColor: 'rgba(8,47,73,0.5)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 2,
  },
  avatar:        { width: 100, height: 100, borderRadius: 50 },
  avatarFallback:{ width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(56,189,248,0.18)', justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontSize: 38, fontWeight: '700', color: ACCENT },
  avatarEditBadge: {
    position: 'absolute', bottom: 3, right: 3,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(12,18,34,0.95)',
    borderWidth: 1.5, borderColor: 'rgba(56,189,248,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  heroName:  { fontSize: 24, fontWeight: '700', color: '#f8fafc', letterSpacing: -0.3, textAlign: 'center' },
  heroEmail: { fontSize: 13, color: 'rgba(148,163,184,0.9)', textAlign: 'center' },
  memberBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(56,189,248,0.10)',
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999, borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.24)', marginTop: 2,
  },
  memberBadgeText: { fontSize: 12, fontWeight: '600', color: 'rgba(241,245,249,0.9)' },
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
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14,
    borderWidth: 1, borderColor: GLASS_BD,
    paddingHorizontal: 20, paddingVertical: 11,
    minHeight: 44,
  },
  btnGhostText: { color: '#e2e8f0', fontWeight: '600', fontSize: 14 },

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
    backgroundColor: 'rgba(12,18,34,0.82)',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.28)',
    padding: 18,
    gap: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.45,
    shadowRadius: 30,
    elevation: 22,
  },
  modalCloseBtn: {
    padding: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
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
    borderColor: 'rgba(56,189,248,0.45)',
    padding: 3,
    backgroundColor: 'rgba(8,47,73,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
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
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
  },
  editStaticBlock: {
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
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
    color: '#f1f5f9',
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
    backgroundColor: 'rgba(15,23,42,0.72)',
    borderRadius: 22, borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.16)',
    paddingVertical: 18, paddingHorizontal: 12,
    alignItems: 'center', gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22, shadowRadius: 14, elevation: 4,
  },
  statIconWrap: {
    width: 42, height: 42, borderRadius: 13,
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderWidth: 1, borderColor: 'rgba(56,189,248,0.22)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 2,
  },
  statValue: { fontSize: 28, fontWeight: '800', color: '#f8fafc', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(148,163,184,0.8)', textAlign: 'center', letterSpacing: 0.4 },

  /* ── Sections ── */
  sectionBlock: { gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 2 },
  sectionIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderWidth: 1, borderColor: 'rgba(56,189,248,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  sectionEyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: 'rgba(148,163,184,0.75)', textTransform: 'uppercase' },
  sectionTitle:   { fontSize: 17, fontWeight: '700', color: '#f1f5f9', marginTop: 2 },
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
  postsEmptyTitle: { fontSize: 16, fontWeight: '700', color: '#f1f5f9', textAlign: 'center' },
  postsEmptyDesc:  { fontSize: 13, color: 'rgba(148,163,184,0.75)', textAlign: 'center', lineHeight: 20 },

  postCard: {
    backgroundColor: 'rgba(15,23,42,0.72)',
    borderRadius: 22, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 5,
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
  postTimeBadgeText: { fontSize: 12, fontWeight: '600', color: '#e2e8f0' },
  postNoImageHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4,
  },
  postTimeBadgeNoImg: { fontSize: 12, fontWeight: '600', color: 'rgba(148,163,184,0.8)' },
  postBody:    { padding: 16, gap: 12 },
  postContent: { fontSize: 15, fontWeight: '500', color: '#e2e8f0', lineHeight: 22 },
  postFooter:  { flexDirection: 'row', alignItems: 'center', gap: 16 },
  postStat:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  postStatText:{ fontSize: 13, fontWeight: '600', color: 'rgba(148,163,184,0.75)' },
  postsModalCard: {
    width: '100%',
    maxWidth: 460,
    maxHeight: Dimensions.get('window').height * 0.9,
    alignSelf: 'center',
    backgroundColor: 'rgba(12,18,34,0.88)',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.24)',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.4,
    shadowRadius: 28,
    elevation: 20,
    gap: 12,
  },
  postsModalList: {
    gap: 14,
    paddingBottom: 6,
  },

  /* ── Glass Card ── */
  glassCard: {
    backgroundColor: GLASS_BG, borderRadius: 22,
    borderWidth: 1, borderColor: GLASS_BD,
    paddingVertical: 6, paddingHorizontal: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22, shadowRadius: 20, elevation: 6,
  },

  /* ── Info rows ── */
  infoRow:      { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4 },
  infoIconBadge:{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(56,189,248,0.10)', justifyContent: 'center', alignItems: 'center' },
  infoTextCol:  { flex: 1, minWidth: 0, gap: 4 },
  infoLabel:    { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, color: 'rgba(148,163,184,0.9)', textTransform: 'uppercase' },
  infoValue:    { fontSize: 15, fontWeight: '500', color: '#f8fafc' },
  separator:    { height: StyleSheet.hairlineWidth, backgroundColor: GLASS_BD, marginLeft: 54 },

  /* ── Menu rows ── */
  menuRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 6, borderRadius: 14, gap: 12 },
  menuRowLogout:   { marginTop: 2 },
  menuRowPressed:  { backgroundColor: 'rgba(255,255,255,0.06)' },
  menuIconWrap:    { width: 42, height: 42, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center' },
  menuIconWrapDanger: { backgroundColor: 'rgba(239,68,68,0.12)' },
  menuLabel:       { flex: 1, fontSize: 15, fontWeight: '500', color: '#f1f5f9' },
  menuLabelDanger: { flex: 1, fontSize: 15, fontWeight: '700', color: '#fecaca' },
  menuDivider:     { height: StyleSheet.hairlineWidth, backgroundColor: GLASS_BD, marginLeft: 58 },
  logoutDivider:   { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 8, marginHorizontal: 4 },

  /* ── Guest ── */
  guestScroll:      { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40, gap: 28 },
  guestIconWrap:    { alignItems: 'center' },
  guestTextWrap:    { alignItems: 'center', gap: 10 },
  guestTitle:       { fontSize: 26, fontWeight: '800', color: '#f1f5f9', letterSpacing: -0.4, textAlign: 'center' },
  guestSubtitle:    { fontSize: 14, color: 'rgba(148,163,184,0.8)', textAlign: 'center', lineHeight: 21 },
  guestCard:        { backgroundColor: 'rgba(8,16,42,0.82)', borderRadius: 28, borderWidth: 1, borderColor: GLASS_BD, padding: 24, gap: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.5, shadowRadius: 24, elevation: 12 },
  guestOption:      { gap: 8 },
  guestOptionTitle: { fontSize: 16, fontWeight: '700', color: '#f1f5f9' },
  guestOptionDesc:  { fontSize: 13, color: 'rgba(148,163,184,0.75)', lineHeight: 19 },
  guestBtnPrimary:  { marginTop: 4, backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  guestBtnPrimaryText: { color: ACCENT_DK, fontSize: 15, fontWeight: '800' },
  guestBtnOutline:  { marginTop: 4, borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(56,189,248,0.5)', paddingVertical: 13, alignItems: 'center' },
  guestBtnOutlineText: { color: ACCENT, fontSize: 15, fontWeight: '700' },
  guestDivider:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  guestDividerLine: { flex: 1, height: 1, backgroundColor: GLASS_BD },
  guestDividerText: { color: 'rgba(148,163,184,0.5)', fontSize: 13 },
});
