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
  View,
} from 'react-native';
import { clearToken } from '../../core/auth/authStorage';
import { getSession, signOut, supabase } from '../../core/auth/supabaseClient';
import type { User } from '../../types';

const GLASS_BG     = 'rgba(255,255,255,0.10)';
const GLASS_BORDER = 'rgba(255,255,255,0.18)';
const GLASS_ACCENT = 'rgba(255,255,255,0.22)';

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => { loadProfile(); }, []);

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
          setProfile(data.data);
          setName(data.data.name ?? fallback.name ?? '');
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
      if (!apiUrl) return;
      const tokenResponse = await getSession();
      if (!tokenResponse?.session) return;
      await fetch(`${apiUrl}/profile`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${tokenResponse.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });
      setEditing(false);
      loadProfile();
    } catch (error) {
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

      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, blob, { upsert: true, contentType: `image/${ext}` });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } });

      setProfile((prev) => prev ? { ...prev, avatar_url: avatarUrl } : prev);

      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      if (apiUrl && tokenResponse.session) {
        await fetch(`${apiUrl}/profile`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${tokenResponse.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ avatar_url: avatarUrl }),
        }).catch(() => {});
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
    router.replace('/welcome');
  };

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    : null;

  const initials = profile?.email?.charAt(0).toUpperCase() ?? '?';

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
        {/* ── Hero: avatar + nombre ── */}
        <View style={styles.heroCard}>
          <View style={styles.avatarWrapper}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>{initials}</Text>
              </View>
            )}
            <Pressable
              style={[styles.editAvatarBtn, uploadingAvatar && { opacity: 0.5 }]}
              onPress={pickAndUploadAvatar}
              disabled={uploadingAvatar}
            >
              {uploadingAvatar
                ? <ActivityIndicator size={14} color="#ffffff" />
                : <Text style={styles.editAvatarIcon}>✏️</Text>
              }
            </Pressable>
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
              <Text style={styles.heroName}>{profile?.name || 'Sin nombre'}</Text>
            )}
            <Text style={styles.heroSub}>
              {memberSince ? `Miembro desde ${memberSince}` : profile?.email ?? ''}
            </Text>

            <View style={styles.heroActions}>
              {editing ? (
                <>
                  <Pressable
                    style={({ pressed }) => [styles.accentBtn, pressed && { opacity: 0.75 }]}
                    onPress={saveProfile}
                    disabled={saving}
                  >
                    <Text style={styles.accentBtnText}>{saving ? 'Guardando...' : 'Guardar'}</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.75 }]}
                    onPress={() => { setEditing(false); setName(profile?.name || ''); }}
                  >
                    <Text style={styles.ghostBtnText}>Cancelar</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.accentBtn, pressed && { opacity: 0.75 }]}
                  onPress={() => setEditing(true)}
                >
                  <Text style={styles.accentBtnText}>Editar perfil</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {/* ── Información de cuenta ── */}
        <View style={styles.glassCard}>
          <Text style={styles.cardTitle}>Información personal</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>NOMBRE</Text>
            <Text style={styles.infoValue}>{profile?.name || 'Sin nombre'}</Text>
          </View>
          <View style={styles.separator} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>CORREO</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{profile?.email || 'No disponible'}</Text>
          </View>
          <View style={styles.separator} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>MIEMBRO DESDE</Text>
            <Text style={styles.infoValue}>{memberSince ?? 'No disponible'}</Text>
          </View>
          <View style={styles.separator} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>ID</Text>
            <Text style={[styles.infoValue, styles.infoValueMono]} numberOfLines={1}>
              {profile?.id || 'No disponible'}
            </Text>
          </View>
        </View>

        {/* ── Cuenta ── */}
        <View style={styles.glassCard}>
          <Text style={styles.cardTitle}>Cuenta</Text>

          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
            onPress={() => setEditing(true)}
          >
            <Text style={styles.menuIcon}>👤</Text>
            <Text style={styles.menuLabel}>Información personal</Text>
            <Text style={styles.menuChevron}>›</Text>
          </Pressable>

          <View style={styles.menuDivider} />

          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
          >
            <Text style={styles.menuIcon}>🔒</Text>
            <Text style={styles.menuLabel}>Seguridad y privacidad</Text>
            <Text style={styles.menuChevron}>›</Text>
          </Pressable>

          <View style={styles.menuDivider} />

          <Pressable
            style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
            onPress={handleLogout}
          >
            <Text style={styles.menuIcon}>🚪</Text>
            <Text style={styles.menuLabelDanger}>Cerrar sesión</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111316',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#111316',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingTop: 60,
    paddingBottom: 32,
    paddingHorizontal: 20,
    gap: 16,
  },

  /* ── Hero ── */
  heroCard: {
    backgroundColor: 'rgba(2,87,129,0.30)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: GLASS_BORDER,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 20,
    backgroundColor: 'rgba(144,205,253,0.25)',
    borderWidth: 2,
    borderColor: GLASS_BORDER,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 40,
    fontWeight: '700',
    color: '#90cdfd',
  },
  editAvatarBtn: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    backgroundColor: GLASS_ACCENT,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    padding: 6,
  },
  editAvatarIcon: {
    fontSize: 14,
  },
  heroInfo: {
    flex: 1,
    gap: 4,
  },
  heroName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  nameInput: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#90cdfd',
    paddingVertical: 4,
    marginBottom: 4,
  },
  heroSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 12,
  },
  heroActions: {
    flexDirection: 'row',
    gap: 10,
  },
  accentBtn: {
    backgroundColor: GLASS_ACCENT,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  accentBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  ghostBtn: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  ghostBtnText: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
    fontSize: 13,
  },

  /* ── Glass Card ── */
  glassCard: {
    backgroundColor: GLASS_BG,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    padding: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },

  /* ── Info rows ── */
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
    color: 'rgba(255,255,255,0.4)',
  },
  infoValue: {
    fontSize: 14,
    color: '#FFFFFF',
    maxWidth: '60%',
    textAlign: 'right',
  },
  infoValueMono: {
    fontVariant: ['tabular-nums'],
    fontSize: 12,
    color: '#90cdfd',
  },
  separator: {
    height: 1,
    backgroundColor: GLASS_BORDER,
  },

  /* ── Menu rows ── */
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 14,
    gap: 14,
  },
  menuRowPressed: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  menuIcon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    color: '#FFFFFF',
  },
  menuLabelDanger: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#ffb4ab',
  },
  menuChevron: {
    fontSize: 22,
    color: 'rgba(255,255,255,0.3)',
  },
  menuDivider: {
    height: 1,
    backgroundColor: GLASS_BORDER,
    marginHorizontal: 4,
  },
});
