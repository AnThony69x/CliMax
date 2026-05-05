import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { getSession, supabase } from '../../core/auth/supabaseClient';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { Buffer } from 'buffer';
import {
  ActivityIndicator,
  Alert as NativeAlert,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const GHOST_ITEMS = Array.from({ length: 6 });
const COMMUNITY_BUCKET_IDS = ['community-alerts', 'COMMUNITY-ALERTS'] as const;
type PostSeverity = 'informacion' | 'alerta' | 'grave';
type CommunityPost = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  image_url?: string | null;
  image_path?: string | null;
  severity?: PostSeverity;
};

const SEVERITY_OPTIONS: PostSeverity[] = ['informacion', 'alerta', 'grave'];

export default function CommunityScreen() {
  const router = useRouter();
  const feedOffset = useRef(new Animated.Value(0)).current;
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [content, setContent] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [severity, setSeverity] = useState<PostSeverity>('informacion');
  const [communityTableMissing, setCommunityTableMissing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const goToLogin = () => {
    router.push('/login?force=1');
  };

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (isLoggedIn) return;
    feedOffset.setValue(0);
    const feedLoop = Animated.loop(
      Animated.timing(feedOffset, {
        toValue: -612,
        duration: 7000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    feedLoop.start();

    return () => {
      feedLoop.stop();
    };
  }, [feedOffset, isLoggedIn]);

  const bootstrap = async () => {
    try {
      const session = await getSession();
      const uid = (session?.user?.id as string | undefined) ?? null;
      setIsLoggedIn(Boolean(uid));
      setUserId(uid);
      if (uid) await loadPosts(uid);
    } catch {
      setIsLoggedIn(false);
      setUserId(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshFeed = async () => {
    setRefreshing(true);
    try {
      const session = await getSession();
      const uid = (session?.user?.id as string | undefined) ?? null;
      setIsLoggedIn(Boolean(uid));
      setUserId(uid);
      if (uid) {
        await loadPosts(uid);
      } else {
        setPosts([]);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const loadPosts = async (uid: string) => {
    const { data, error } = await supabase
      .from('community_posts')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    if (error) {
      const missingTable =
        error.code === 'PGRST205' ||
        error.message?.includes("Could not find the table 'public.community_posts'");
      if (missingTable) {
        setCommunityTableMissing(true);
        console.warn('[Community][loadPosts] Tabla faltante: public.community_posts');
      } else {
        console.warn('[Community][loadPosts] Error inesperado:', error.message);
      }
      setPosts([]);
      return;
    }
    setCommunityTableMissing(false);
    const normalized = (data ?? []).map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      content: row.content,
      created_at: row.created_at,
      image_url: typeof row.image_url === 'string' ? row.image_url : null,
      image_path: typeof row.image_path === 'string' ? row.image_path : null,
      severity: (row.severity as PostSeverity | null) ?? 'informacion',
    })) as CommunityPost[];
    setPosts(normalized);
  };

  const seleccionarImagen = async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      NativeAlert.alert('Permiso requerido', 'Debes permitir acceso a la galería.');
      return;
    }

    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
      base64: true,
    });

    const selected = resultado.assets?.[0];
    if (!resultado.canceled && selected?.uri) {
      setImageUri(selected.uri);
      setImageBase64(selected.base64 ?? null);
      setImageMimeType(selected.mimeType ?? null);
    }
  };

  const tomarFoto = async () => {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      NativeAlert.alert('Permiso requerido', 'Debes permitir acceso a la cámara.');
      return;
    }

    const resultado = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
      base64: true,
    });

    const selected = resultado.assets?.[0];
    if (!resultado.canceled && selected?.uri) {
      setImageUri(selected.uri);
      setImageBase64(selected.base64 ?? null);
      setImageMimeType(selected.mimeType ?? null);
    }
  };

  const limpiarFormulario = () => {
    setContent('');
    setImageUri(null);
    setImageBase64(null);
    setImageMimeType(null);
    setEditingId(null);
    setSeverity('informacion');
  };

  const savePost = async () => {
    if (!userId) return;
    if (!imageUri) {
      NativeAlert.alert('Advertencia', 'Debes seleccionar o tomar una imagen.');
      return;
    }
    const normalizedLocation = content.trim();
    if (!normalizedLocation || normalizedLocation.length < 6) {
      NativeAlert.alert('Advertencia', 'Debes escribir una ubicación válida. Ejemplo: Avenida 10 de Agosto y Colón.');
      return;
    }

    setSaving(true);
    console.log('[Community][savePost] Inicio', {
      editing: Boolean(editingId),
      hasImageUri: Boolean(imageUri),
      hasBase64: Boolean(imageBase64),
      severity,
    });
    try {
      if (communityTableMissing) {
        NativeAlert.alert(
          'Configuración pendiente',
          'Falta crear la tabla community_posts en Supabase para guardar publicaciones.'
        );
        return;
      }
      let imageUrlToSave: string | null = imageUri;
      let imagePathToSave: string | null = null;

      if (!imageUri.startsWith('http')) {
        const mimeType = normalizeMimeType(imageMimeType, imageUri);
        const ext = extensionFromMimeTypeOrUri(mimeType, imageUri);
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        imagePathToSave = `${userId}/${fileName}`;

        const imageBase64Payload = imageBase64 ?? (await fileUriToBase64(imageUri));
        const fileBody = base64ToUint8Array(imageBase64Payload);
        console.log('[Community][savePost] Imagen convertida', {
          path: imagePathToSave,
          source: imageBase64 ? 'picker-base64' : 'file-system-base64',
          mimeType,
        });
        const uploadResult = await uploadToCommunityBucket(imagePathToSave, fileBody, mimeType);
        console.log('[Community][savePost] Upload OK', uploadResult);
        imageUrlToSave = uploadResult.publicUrl;
      }

      if (editingId) {
        let { error } = await supabase
          .from('community_posts')
          .update({
            content: normalizedLocation,
            image_url: imageUrlToSave,
            image_path: imagePathToSave,
            severity,
          })
          .eq('id', editingId)
          .eq('user_id', userId);
        if (error && error.message?.includes('column')) {
          ({ error } = await supabase
            .from('community_posts')
            .update({ content: normalizedLocation })
            .eq('id', editingId)
            .eq('user_id', userId));
        }
        if (error) throw error;
        console.log('[Community][savePost] Update DB OK', { id: editingId });
      } else {
        let { error } = await supabase.from('community_posts').insert({
          user_id: userId,
          content: normalizedLocation,
          image_url: imageUrlToSave,
          image_path: imagePathToSave,
          severity,
        });
        if (error && error.message?.includes('column')) {
          ({ error } = await supabase.from('community_posts').insert({
            user_id: userId,
            content: normalizedLocation,
          }));
        }
        if (error) throw error;
        console.log('[Community][savePost] Insert DB OK');
      }
      limpiarFormulario();
      setComposerOpen(false);
      await loadPosts(userId);
      console.log('[Community][savePost] Finalizado OK');
    } catch (error: any) {
      console.error('[Community][savePost] ERROR', {
        name: error?.name,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
      });
      const rawMessage = typeof error?.message === 'string' ? error.message : '';
      const normalizedError = rawMessage.toLowerCase();
      const networkError =
        normalizedError.includes('network request failed') ||
        normalizedError.includes('failed to fetch');

      NativeAlert.alert(
        'No se pudo guardar',
        networkError
          ? 'Falló la conexión de red al subir la foto. Verifica internet, permisos de cámara/galería y vuelve a intentarlo.'
          : rawMessage.includes('relation')
            ? 'Falta la tabla community_posts en Supabase.'
            : (rawMessage || 'Ocurrió un error guardando la publicación.')
      );
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (post: CommunityPost) => {
    setEditingId(post.id);
    setContent(post.content);
    setImageUri(post.image_url ?? null);
    setImageBase64(null);
    setImageMimeType(null);
    setSeverity(post.severity ?? 'informacion');
    setComposerOpen(true);
  };

  const deletePost = async (id: string) => {
    if (!userId) return;
    try {
      const { error } = await supabase
        .from('community_posts')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
      if (evidenceHasPath(posts, id)) {
        const path = posts.find((post) => post.id === id)?.image_path;
        if (path) {
          await removeFromCommunityBuckets([path]);
        }
      }
      setPosts((prev) => prev.filter((post) => post.id !== id));
      if (editingId === id) {
        limpiarFormulario();
      }
    } catch (error: any) {
      NativeAlert.alert('No se pudo eliminar', error?.message ?? 'Intenta nuevamente.');
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={{ flex: 1 }}
        alwaysBounceVertical
        overScrollMode="always"
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshFeed}
            tintColor="#90cdfd"
            colors={['#90cdfd']}
            progressViewOffset={70}
          />
        }
      >
        <Text style={styles.title}>Comunidad</Text>
        <Text style={styles.subtitle}>Espacio de publicaciones y reportes ciudadanos.</Text>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#90cdfd" />
          </View>
        ) : isLoggedIn ? (
          <>
          <View style={styles.postsListOutside}>
            <Text style={styles.feedSectionTitle}>Publicaciones recientes</Text>
            {posts.length === 0 ? (
              <View style={styles.feedSkeletonWrap}>
                {[0, 1, 2].map((item) => (
                  <View key={item} style={styles.feedSkeletonCard}>
                    <View style={styles.feedSkeletonHeader}>
                      <View style={styles.feedSkeletonAvatar} />
                      <View style={styles.feedSkeletonHeadLines}>
                        <View style={styles.feedSkeletonLineLg} />
                        <View style={styles.feedSkeletonLineSm} />
                      </View>
                    </View>
                    <View style={styles.feedSkeletonImage} />
                    <View style={styles.feedSkeletonLineMd} />
                    <View style={styles.feedSkeletonLineXs} />
                  </View>
                ))}
                <Text style={styles.emptyPostsText}>Aun no tienes publicaciones.</Text>
              </View>
            ) : (
              posts.map((post) => (
                <View key={post.id} style={styles.postCard}>
                  <View style={styles.feedHeader}>
                    <View style={styles.avatarDot} />
                    <Text style={styles.feedUser}>Tu reporte</Text>
                    <Text style={styles.feedBadge}>
                      {(post.severity ?? 'informacion') === 'informacion'
                        ? 'Información'
                        : (post.severity ?? 'informacion') === 'alerta'
                          ? 'Alerta'
                          : 'Grave'}
                    </Text>
                  </View>
                  {post.image_url ? <Image source={{ uri: post.image_url }} style={styles.postImage} /> : null}
                  <Text style={styles.postText}>{post.content}</Text>
                  <Text style={styles.postDate}>
                    {new Date(post.created_at).toLocaleString('es-ES')}
                  </Text>
                  <View style={styles.postActions}>
                    <Pressable style={styles.smallBtn} onPress={() => startEdit(post)}>
                      <Text style={styles.smallBtnText}>Editar</Text>
                    </Pressable>
                    <Pressable style={styles.smallDangerBtn} onPress={() => deletePost(post.id)}>
                      <Text style={styles.smallBtnText}>Eliminar</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
          </>
        ) : (
          <View style={styles.skeletonWrap}>
          <Animated.View style={{ transform: [{ translateY: feedOffset }] }}>
            {[...GHOST_ITEMS, ...GHOST_ITEMS].map((_, index) => (
              <View key={index} style={styles.skeletonCard}>
                <View style={styles.thumb} />
                <View style={styles.body}>
                  <View style={styles.lineLg} />
                  <View style={styles.lineMd} />
                  <View style={styles.lineSm} />
                </View>
              </View>
            ))}
          </Animated.View>

          <View style={styles.overlay}>
            <Text style={styles.overlayText}>Inicia sesion para utilizar esta seccion</Text>
            <Pressable
              style={({ pressed }) => [styles.loginBtn, pressed && { opacity: 0.85 }]}
              onPress={goToLogin}
            >
              <Text style={styles.loginBtnText}>Ir a login</Text>
            </Pressable>
          </View>
          </View>
        )}
      </ScrollView>

      {isLoggedIn && !loading && (
        <Pressable
          style={({ pressed }) => [styles.fabBtn, pressed && { opacity: 0.85 }]}
          onPress={() => {
            if (composerOpen && !editingId) limpiarFormulario();
            setComposerOpen((prev) => !prev);
          }}
        >
          <Ionicons name={composerOpen ? 'close' : 'camera'} size={24} color="#FFFFFF" />
        </Pressable>
      )}

      <Modal
        visible={isLoggedIn && composerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setComposerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId ? 'Editar publicación' : 'Nueva publicación'}
              </Text>
              <Pressable
                style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.75 }]}
                onPress={() => setComposerOpen(false)}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScrollContent}>
              <Text style={styles.stepLabel}>Paso 1: toma o selecciona una foto</Text>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.previewImage} />
              ) : (
                <View style={styles.emptyPreview}>
                  <Text style={styles.emptyPreviewText}>No hay imagen seleccionada</Text>
                </View>
              )}

              <Pressable style={styles.cameraBtn} onPress={tomarFoto}>
                <Text style={styles.actionBtnText}>Tomar Foto</Text>
              </Pressable>
              <Pressable style={styles.galleryBtn} onPress={seleccionarImagen}>
                <Text style={styles.actionBtnText}>Seleccionar de Galeria</Text>
              </Pressable>

              <Text style={styles.stepLabel}>Paso 2: clasifica la publicación</Text>
              <View style={styles.severityRow}>
                {SEVERITY_OPTIONS.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setSeverity(item)}
                    style={[styles.severityChip, severity === item && styles.severityChipActive]}
                  >
                    <Text style={styles.severityChipText}>
                      {item === 'informacion' ? 'Información' : item === 'alerta' ? 'Alerta' : 'Grave'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Ubicacion:</Text>
              <TextInput
                style={styles.input}
                value={content}
                onChangeText={setContent}
                placeholder="Ejemplo: Avenida Amazonas y Naciones Unidas"
                placeholderTextColor="rgba(255,255,255,0.45)"
                multiline
              />
              <View style={styles.crudActions}>
                <Pressable
                  style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }, saving && { opacity: 0.6 }]}
                  onPress={savePost}
                  disabled={saving}
                >
                  <Text style={styles.saveBtnText}>
                    {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Publicar'}
                  </Text>
                </Pressable>
                <Pressable style={styles.cancelBtn} onPress={limpiarFormulario}>
                  <Text style={styles.cancelBtnText}>{editingId ? 'Cancelar' : 'Limpiar'}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0c0e11',
  },
  container: {
    flexGrow: 1,
    backgroundColor: '#0c0e11',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 32,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.62)',
    marginBottom: 16,
  },
  centerBox: {
    minHeight: 320,
    justifyContent: 'center',
    alignItems: 'center',
  },
  crudWrap: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(9,12,18,0.95)',
    padding: 14,
    gap: 8,
  },
  crudTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  crudSubtitle: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: -4,
    marginBottom: 8,
  },
  stepLabel: {
    color: '#dbeafe',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 6,
  },
  previewImage: {
    width: '100%',
    height: 240,
    borderRadius: 14,
    marginTop: 6,
  },
  emptyPreview: {
    width: '100%',
    height: 220,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  emptyPreviewText: {
    color: 'rgba(255,255,255,0.58)',
  },
  cameraBtn: {
    backgroundColor: '#1565c0',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  galleryBtn: {
    backgroundColor: '#00897b',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  severityRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  severityChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  severityChipActive: {
    borderColor: '#90cdfd',
    backgroundColor: 'rgba(144,205,253,0.25)',
  },
  severityChipText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  input: {
    minHeight: 96,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  crudActions: {
    flexDirection: 'row',
    gap: 8,
  },
  saveBtn: {
    backgroundColor: '#2A7A4B',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  cancelBtn: {
    backgroundColor: '#5f6b75',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  cancelBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  postsList: {
    gap: 10,
    marginTop: 2,
  },
  postsListOutside: {
    gap: 12,
    marginTop: 12,
    marginHorizontal: -4,
  },
  feedSectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  feedSkeletonWrap: {
    gap: 10,
  },
  feedSkeletonCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    padding: 12,
    gap: 10,
  },
  feedSkeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  feedSkeletonAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  feedSkeletonHeadLines: {
    flex: 1,
    gap: 6,
  },
  feedSkeletonImage: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  feedSkeletonLineLg: {
    width: '62%',
    height: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  feedSkeletonLineMd: {
    width: '84%',
    height: 7,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  feedSkeletonLineSm: {
    width: '38%',
    height: 7,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  feedSkeletonLineXs: {
    width: '55%',
    height: 7,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  emptyPostsText: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 2,
  },
  postCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    padding: 14,
    gap: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 2,
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2A7A4B',
  },
  feedUser: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
    flex: 1,
  },
  feedBadge: {
    color: '#dbeafe',
    fontSize: 11,
    fontWeight: '700',
  },
  postText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
  },
  postImage: {
    width: '100%',
    height: 240,
    borderRadius: 14,
    marginBottom: 4,
  },
  postDate: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 11,
  },
  postActions: {
    flexDirection: 'row',
    gap: 8,
  },
  smallBtn: {
    backgroundColor: 'rgba(144,205,253,0.18)',
    borderColor: '#90cdfd',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  smallDangerBtn: {
    backgroundColor: 'rgba(255,90,90,0.24)',
    borderColor: 'rgba(255,120,120,0.7)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  smallBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  skeletonWrap: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(9,12,18,0.95)',
    padding: 14,
    gap: 10,
    overflow: 'hidden',
    minHeight: 650,
  },
  skeletonCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
    minHeight: 92,
    marginBottom: 10,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: 7,
  },
  lineLg: {
    width: '86%',
    height: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  lineMd: {
    width: '72%',
    height: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  lineSm: {
    width: '54%',
    height: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.58)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 12,
  },
  overlayText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  loginBtn: {
    backgroundColor: '#2A7A4B',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  fabBtn: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#1565c0',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '88%',
    backgroundColor: '#0f1522',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    padding: 14,
    gap: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  modalCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  modalScrollContent: {
    gap: 10,
    paddingBottom: 10,
  },
});

function evidenceHasPath(posts: CommunityPost[], id: string) {
  return Boolean(posts.find((post) => post.id === id)?.image_path);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const cleaned = base64.includes(',') ? base64.split(',').pop() ?? '' : base64;
  return Buffer.from(cleaned, 'base64');
}

async function fileUriToBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

function normalizeMimeType(rawMimeType: string | null, uri: string): string {
  const normalized = (rawMimeType ?? '').toLowerCase().trim();
  if (normalized === 'image/jpg') return 'image/jpeg';
  if (normalized.startsWith('image/')) return normalized;

  const extFromUri = extensionFromUri(uri);
  if (extFromUri === 'jpg') return 'image/jpeg';
  if (extFromUri) return `image/${extFromUri}`;
  return 'image/jpeg';
}

function extensionFromMimeTypeOrUri(mimeType: string, uri: string): string {
  const extFromMime = mimeType.split('/')[1]?.toLowerCase();
  if (extFromMime === 'jpeg') return 'jpg';
  if (extFromMime) return extFromMime;
  return extensionFromUri(uri) || 'jpg';
}

function extensionFromUri(uri: string): string {
  const cleanUri = uri.split('?')[0];
  const fromUri = cleanUri.split('.').pop()?.toLowerCase();
  if (!fromUri) return 'jpg';
  return fromUri.replace(/[^a-z0-9]/g, '');
}

async function uploadToCommunityBucket(path: string, body: ArrayBufferView | Blob, contentType: string) {
  let lastError: any = null;

  for (const bucketId of COMMUNITY_BUCKET_IDS) {
    console.log('[Community][upload] Intentando bucket', { bucketId, path });
    const { error } = await supabase.storage
      .from(bucketId)
      .upload(path, body, { upsert: false, contentType });

    if (!error) {
      const { data } = supabase.storage.from(bucketId).getPublicUrl(path);
      console.log('[Community][upload] Upload exitoso', { bucketId, publicUrl: data.publicUrl });
      return { bucketId, publicUrl: data.publicUrl };
    }
    console.warn('[Community][upload] Fallo bucket', {
      bucketId,
      message: error.message,
      code: (error as any)?.code,
    });
    lastError = error;
  }

  const msg = (lastError?.message ?? '').toLowerCase();
  if (msg.includes('bucket') || msg.includes('not found')) {
    throw new Error('No se encontró el bucket community-alerts/COMMUNITY-ALERTS en Supabase.');
  }
  if (msg.includes('row-level security') || msg.includes('policy') || msg.includes('unauthorized')) {
    throw new Error('Las políticas del bucket no permiten subir archivos para este usuario.');
  }
  throw lastError ?? new Error('No se pudo subir la imagen al bucket de comunidad.');
}

async function removeFromCommunityBuckets(paths: string[]) {
  for (const bucketId of COMMUNITY_BUCKET_IDS) {
    await supabase.storage.from(bucketId).remove(paths).catch(() => {});
  }
}
