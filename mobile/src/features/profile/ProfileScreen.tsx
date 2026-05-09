import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { clearToken } from '../../core/auth/authStorage';
import { getSession, signOut, supabase } from '../../core/auth/supabaseClient';
import type { User } from '../../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const GLASS_BG     = 'rgba(255,255,255,0.10)';
const GLASS_BORDER = 'rgba(255,255,255,0.18)';
const ACCENT       = '#38bdf8';
const ACCENT_MUTED = 'rgba(56,189,248,0.35)';
const SURFACE_DEEP = '#0c1222';

/** Altura aproximada del header del Stack en pantalla de perfil (título “Mi perfil”). */
const PROFILE_STACK_HEADER = 56;
/** Alto aproximado del bloque foto + nombre + acciones (para repartir espacio sin ir a extremos). */
const HERO_BLOCK_ESTIMATE = 248;
/** Límites del margen superior del hero: ni pegado al header ni demasiado abajo. */
const HERO_PAD_TOP_MIN = 18;
const HERO_PAD_TOP_MAX = 44;

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => { loadProfile(); }, []);

  const upsertProfileRow = async (
    userId: string,
    payload: { name?: string | null; avatar_url?: string | null }
  ) => {
    const { error } = await supabase.from('profiles').upsert(
      {
        id: userId,
        ...payload,
      },
      { onConflict: 'id' }
    );

    if (error) {
      throw error;
    }
  };

  const loadProfile = async () => {
    try {
      const tokenResponse = await getSession();
      if (!tokenResponse?.user) { setLoading(false); return; }

      const supabaseUser = tokenResponse.user as any;
      const fallback: User = {
        id:         supabaseUser.id,
        email:      supabaseUser.email,
        name:       supabaseUser.user_metadata?.name ?? supabaseUser.user_metadata?.full_name ?? '',
        avatar_url: supabaseUser.user_metadata?.avatar_url ?? undefined,
        created_at: supabaseUser.created_at,
      };
      setProfile(fallback);
      setName(fallback.name ?? '');

      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      if (!apiUrl) return;

      const response = await fetch(`${apiUrl}/profile`, {
        headers: { Authorization: `Bearer ${tokenResponse.session.access_token}` },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.data) {
          const mergedProfile: User = {
            ...fallback,
            ...data.data,
            name: data.data.name ?? fallback.name ?? '',
            email: data.data.email ?? fallback.email,
            avatar_url: data.data.avatar_url ?? fallback.avatar_url,
            created_at: data.data.created_at ?? fallback.created_at,
          };
          setProfile(mergedProfile);
          setName(mergedProfile.name ?? '');
        }
      }
    } catch (error) {
      console.warn('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const tokenResponse = await getSession();
      if (!tokenResponse?.session || !tokenResponse.user?.id) return;

      const nextName = name.trim() || null;

      if (apiUrl) {
        const response = await fetch(`${apiUrl}/profile`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${tokenResponse.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: nextName }),
        });

        if (!response.ok) {
          throw new Error('No se pudo actualizar el perfil en la API.');
        }
      }

      await upsertProfileRow(tokenResponse.user.id, { name: nextName });
      setEditing(false);
      loadProfile();
    } catch (error) {
      Alert.alert('Error', 'No se pudo guardar el perfil. Intenta nuevamente.');
      console.warn('Error saving profile:', error);
    } finally {
      setSaving(false);
    }
  };

  const pickAndUploadAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para cambiar la foto.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled || !result.assets[0]) return;

    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      const tokenResponse = await getSession();
      if (!tokenResponse?.user) throw new Error('Sin sesión');

      const userId = (tokenResponse.user as any).id as string;
      const filePath = `${userId}/avatar.${ext}`;
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const fileBody = decode(base64);

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, fileBody, { upsert: true, contentType: normalizeImageContentType(ext) });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } });
      await upsertProfileRow(userId, { avatar_url: avatarUrl });

      setProfile((prev) => prev ? { ...prev, avatar_url: avatarUrl } : prev);

      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      if (apiUrl && tokenResponse.session) {
        const response = await fetch(`${apiUrl}/profile`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${tokenResponse.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ avatar_url: avatarUrl }),
        });

        if (!response.ok) {
          console.warn('Profile API avatar update failed, avatar persisted in profiles table.');
        }
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo subir la foto. Intenta de nuevo.');
      console.warn('Error uploading avatar:', error);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleLogout = async () => {
    try { await signOut(); } catch { /* ignorar errores de red */ }
    await clearToken();
    router.replace('/login');
  };

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    : null;

  const displayInitial =
    (profile?.name?.trim()?.charAt(0) || profile?.email?.charAt(0) || '?').toUpperCase();

  // Reparto vertical suave: intento de centrado respecto al cuerpo útil, pero acotado para que
  // en pantallas altas no quede “muy abajo” ni en pequeñas “muy arriba”.
  const bodyHeightApprox =
    windowHeight - PROFILE_STACK_HEADER - insets.top - insets.bottom;
  const idealHeroPad = Math.floor(
    (bodyHeightApprox - HERO_BLOCK_ESTIMATE) / 2
  );
  const scrollHeroPaddingTop = Math.max(
    HERO_PAD_TOP_MIN,
    Math.min(HERO_PAD_TOP_MAX, idealHeroPad)
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <View style={[styles.bgGlowTop, { opacity: 0.6 }]} />
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <View style={styles.bgGlowTop} />
        <View style={styles.bgGlowBottom} />

        <ScrollView
          contentContainerStyle={styles.guestScroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Icono */}
          <View style={styles.guestIconWrap}>
            <Ionicons name="person-circle-outline" size={80} color="rgba(148,163,184,0.6)" />
          </View>

          {/* Textos */}
          <View style={styles.guestTextWrap}>
            <Text style={styles.guestTitle}>Tu perfil te espera</Text>
            <Text style={styles.guestSubtitle}>
              Inicia sesión para ver y gestionar tu cuenta, o crea una nueva si eres usuario nuevo.
            </Text>
          </View>

          {/* Card de opciones */}
          <View style={styles.guestCard}>
            {/* Opción login */}
            <View style={styles.guestOption}>
              <Text style={styles.guestOptionTitle}>¿Ya tienes cuenta?</Text>
              <Text style={styles.guestOptionDesc}>
                Inicia sesión con tu correo y contraseña para acceder a tu perfil.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.guestBtnPrimary, pressed && styles.guestBtnPrimaryPressed]}
                onPress={() => router.push('/login')}
              >
                <Text style={styles.guestBtnPrimaryText}>Iniciar sesión</Text>
              </Pressable>
            </View>

            <View style={styles.guestDivider}>
              <View style={styles.guestDividerLine} />
              <Text style={styles.guestDividerText}>o</Text>
              <View style={styles.guestDividerLine} />
            </View>

            {/* Opción registro */}
            <View style={styles.guestOption}>
              <Text style={styles.guestOptionTitle}>¿Eres nuevo?</Text>
              <Text style={styles.guestOptionDesc}>
                Crea una cuenta gratis para guardar tus ciudades favoritas y personalizar la app.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.guestBtnOutline, pressed && styles.guestBtnOutlinePressed]}
                onPress={() => router.push('/register')}
              >
                <Text style={styles.guestBtnOutlineText}>Crear cuenta</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={styles.bgGlowTop} />
      <View style={styles.bgGlowBottom} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: scrollHeroPaddingTop,
            paddingBottom: Math.max(insets.bottom, 16) + 24,
          },
        ]}
      >
        {/* ── Hero ── */}
        <View style={styles.heroCard}>
          <View style={styles.heroAvatarCol}>
            <Pressable
              onPress={pickAndUploadAvatar}
              disabled={uploadingAvatar}
              style={({ pressed }) => [
                styles.avatarRing,
                pressed && styles.avatarRingPressed,
                uploadingAvatar && { opacity: 0.65 },
              ]}
            >
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>{displayInitial}</Text>
                </View>
              )}
              <View style={styles.editAvatarFab}>
                {uploadingAvatar ? (
                  <ActivityIndicator size={16} color="#ffffff" />
                ) : (
                  <Ionicons name="camera" size={16} color="#ffffff" />
                )}
              </View>
            </Pressable>
            <Text style={styles.photoHint}>Toca la foto para cambiarla</Text>
          </View>

          <View style={styles.heroInfo}>
            {editing ? (
              <TextInput
                style={styles.nameInput}
                value={name}
                onChangeText={setName}
                placeholder="Tu nombre"
                placeholderTextColor="rgba(255,255,255,0.4)"
                autoFocus
              />
            ) : (
              <Text style={styles.heroName} numberOfLines={2}>
                {profile?.name || 'Sin nombre'}
              </Text>
            )}
            <Text style={styles.heroEmail} numberOfLines={1}>
              {profile?.email ?? ''}
            </Text>
            {memberSince ? (
              <Text style={styles.heroSub}>Miembro desde {memberSince}</Text>
            ) : null}

            <View style={styles.heroActions}>
              {editing ? (
                <>
                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      styles.heroEditBtnNatural,
                      pressed && styles.primaryBtnPressed,
                    ]}
                    onPress={saveProfile}
                    disabled={saving}
                  >
                    <Text style={styles.primaryBtnText}>{saving ? 'Guardando…' : 'Guardar'}</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.ghostBtn,
                      styles.heroEditBtnNatural,
                      pressed && styles.ghostBtnPressed,
                    ]}
                    onPress={() => { setEditing(false); setName(profile?.name || ''); }}
                  >
                    <Text style={styles.ghostBtnText}>Cancelar</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
                  onPress={() => setEditing(true)}
                >
                  <Ionicons name="pencil" size={16} color="#082f49" style={{ marginRight: 6 }} />
                  <Text style={styles.primaryBtnText}>Editar perfil</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {/* ── Datos ── */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="id-card-outline" size={18} color={ACCENT} />
            </View>
            <View>
              <Text style={styles.sectionEyebrow}>Resumen</Text>
              <Text style={styles.sectionTitle}>Tus datos</Text>
            </View>
          </View>

          <View style={styles.glassCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoIconBadge}>
                <Ionicons name="person" size={18} color={ACCENT} />
              </View>
              <View style={styles.infoTextCol}>
                <Text style={styles.infoLabel}>Nombre</Text>
                <Text style={styles.infoValue}>{profile?.name || 'Sin nombre'}</Text>
              </View>
            </View>
            <View style={styles.separator} />

            <View style={styles.infoRow}>
              <View style={styles.infoIconBadge}>
                <Ionicons name="mail-outline" size={18} color={ACCENT} />
              </View>
              <View style={styles.infoTextCol}>
                <Text style={styles.infoLabel}>Correo</Text>
                <Text style={styles.infoValue} numberOfLines={2}>
                  {profile?.email || 'No disponible'}
                </Text>
              </View>
            </View>
            <View style={styles.separator} />

            <View style={styles.infoRow}>
              <View style={styles.infoIconBadge}>
                <Ionicons name="calendar-outline" size={18} color={ACCENT} />
              </View>
              <View style={styles.infoTextCol}>
                <Text style={styles.infoLabel}>Miembro desde</Text>
                <Text style={styles.infoValue}>{memberSince ?? 'No disponible'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Acciones ── */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="settings-outline" size={18} color={ACCENT} />
            </View>
            <View>
              <Text style={styles.sectionEyebrow}>Preferencias</Text>
              <Text style={styles.sectionTitle}>Cuenta</Text>
            </View>
          </View>

          <View style={styles.glassCard}>
            <Pressable
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
              onPress={() => setEditing(true)}
            >
              <View style={styles.menuIconWrap}>
                <Ionicons name="person-outline" size={20} color="#e2e8f0" />
              </View>
              <Text style={styles.menuLabel}>Editar información personal</Text>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.28)" />
            </Pressable>

            <View style={styles.menuDivider} />

            <Pressable
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
            >
              <View style={styles.menuIconWrap}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#e2e8f0" />
              </View>
              <Text style={styles.menuLabel}>Seguridad y privacidad</Text>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.28)" />
            </Pressable>

            <View style={styles.logoutDivider} />

            <Pressable
              style={({ pressed }) => [styles.menuRow, styles.menuRowLogout, pressed && styles.menuRowPressed]}
              onPress={handleLogout}
            >
              <View style={[styles.menuIconWrap, styles.menuIconWrapDanger]}>
                <Ionicons name="log-out-outline" size={20} color="#fecaca" />
              </View>
              <Text style={styles.menuLabelDanger}>Cerrar sesión</Text>
              <Ionicons name="chevron-forward" size={20} color="rgba(254,202,202,0.35)" />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function normalizeImageContentType(extRaw: string): string {
  const ext = extRaw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
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
    overflow: 'hidden',
  },
  bgGlowTop: {
    position: 'absolute',
    top: -100,
    left: -100,
    width: 340,
    height: 340,
    borderRadius: 999,
    backgroundColor: 'rgba(2,87,129,0.28)',
  },
  bgGlowBottom: {
    position: 'absolute',
    bottom: -60,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 999,
    backgroundColor: 'rgba(56,189,248,0.12)',
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 22,
  },

  /* ── Hero ── */
  heroCard: {
    backgroundColor: 'rgba(15,23,42,0.72)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.22)',
    paddingVertical: 22,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 10,
  },
  heroAvatarCol: {
    alignItems: 'center',
    width: 118,
  },
  avatarRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    padding: 3,
    borderWidth: 2,
    borderColor: ACCENT_MUTED,
    backgroundColor: 'rgba(8,47,73,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarRingPressed: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(8,47,73,0.75)',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(56,189,248,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 38,
    fontWeight: '700',
    color: ACCENT,
  },
  editAvatarFab: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.95)',
    borderWidth: 1.5,
    borderColor: ACCENT_MUTED,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoHint: {
    marginTop: 10,
    fontSize: 11,
    color: 'rgba(148,163,184,0.85)',
    textAlign: 'center',
    lineHeight: 15,
  },
  heroInfo: {
    flex: 1,
    gap: 2,
    minWidth: 0,
    paddingTop: 4,
  },
  heroName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f8fafc',
    letterSpacing: -0.3,
  },
  heroEmail: {
    fontSize: 13,
    color: 'rgba(148,163,184,0.95)',
    marginTop: 2,
  },
  nameInput: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    borderBottomWidth: 1.5,
    borderBottomColor: ACCENT,
    paddingVertical: 4,
    marginBottom: 4,
  },
  heroSub: {
    fontSize: 12,
    color: 'rgba(148,163,184,0.8)',
    marginTop: 6,
    marginBottom: 14,
    fontWeight: '500',
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    marginTop: 8,
  },
  /** Modo edición: ancho según texto (sin estirar a media fila). */
  heroEditBtnNatural: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'center',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 42,
  },
  primaryBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  primaryBtnText: {
    color: '#082f49',
    fontWeight: '700',
    fontSize: 13,
  },
  ghostBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 42,
    justifyContent: 'center',
  },
  ghostBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  ghostBtnText: {
    color: 'rgba(226,232,240,0.9)',
    fontWeight: '600',
    fontSize: 13,
    textAlign: 'center',
  },

  /* ── Secciones ── */
  sectionBlock: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 2,
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: 'rgba(148,163,184,0.75)',
    textTransform: 'uppercase',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f1f5f9',
    marginTop: 2,
  },

  /* ── Glass Card ── */
  glassCard: {
    backgroundColor: GLASS_BG,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    paddingVertical: 6,
    paddingHorizontal: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 6,
  },

  /* ── Info rows ── */
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  infoIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(56,189,248,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    color: 'rgba(148,163,184,0.9)',
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#f8fafc',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: GLASS_BORDER,
    marginLeft: 54,
  },

  /* ── Menu rows ── */
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 6,
    borderRadius: 14,
    gap: 12,
  },
  menuRowLogout: {
    marginTop: 2,
  },
  menuRowPressed: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  menuIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuIconWrapDanger: {
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#f1f5f9',
  },
  menuLabelDanger: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#fecaca',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: GLASS_BORDER,
    marginLeft: 58,
  },
  logoutDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 8,
    marginHorizontal: 4,
  },

  /* ── Vista de invitado ── */
  guestScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 60,
    gap: 28,
  },
  guestIconWrap: {
    alignItems: 'center',
  },
  guestTextWrap: {
    alignItems: 'center',
    gap: 10,
  },
  guestTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#f1f5f9',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  guestSubtitle: {
    fontSize: 14,
    color: 'rgba(148,163,184,0.8)',
    textAlign: 'center',
    lineHeight: 21,
  },
  guestCard: {
    backgroundColor: 'rgba(8,16,42,0.82)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    padding: 24,
    gap: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  guestOption: {
    gap: 8,
  },
  guestOptionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  guestOptionDesc: {
    fontSize: 13,
    color: 'rgba(148,163,184,0.75)',
    lineHeight: 19,
  },
  guestBtnPrimary: {
    marginTop: 4,
    backgroundColor: '#38bdf8',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  guestBtnPrimaryPressed: { backgroundColor: '#0284c7' },
  guestBtnPrimaryText: {
    color: '#082f49',
    fontSize: 15,
    fontWeight: '800',
  },
  guestBtnOutline: {
    marginTop: 4,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(56,189,248,0.5)',
    paddingVertical: 13,
    alignItems: 'center',
  },
  guestBtnOutlinePressed: { backgroundColor: 'rgba(56,189,248,0.08)' },
  guestBtnOutlineText: {
    color: '#38bdf8',
    fontSize: 15,
    fontWeight: '700',
  },
  guestDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  guestDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: GLASS_BORDER,
  },
  guestDividerText: {
    color: 'rgba(148,163,184,0.5)',
    fontSize: 13,
  },
});
