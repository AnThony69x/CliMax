import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSession, supabase } from '../../core/auth/supabaseClient';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Buffer } from 'buffer';
import { fetchAddress } from '../../core/api/weatherApi';
import {
  ActivityIndicator,
  Alert as NativeAlert,
  Animated,
  Easing,
  findNodeHandle,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SURFACE_DEEP = '#0c1222';
const ACCENT       = '#38bdf8';

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
type CommunityProfile = {
  id: string;
  name?: string | null;
  avatar_url?: string | null;
};
type CommunityComment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  parent_comment_id?: string | null;
};
type CommentTarget = {
  postId: string;
  commentId: string;
  authorName: string;
};
type ReactionType = 'like' | 'apoya' | 'importante' | 'sorprende';
type FeedSortMode = 'recent' | 'priority';

const SEVERITY_OPTIONS: PostSeverity[] = ['informacion', 'alerta', 'grave'];
const REACTION_OPTIONS: Array<{ key: ReactionType; label: string; icon: string }> = [
  { key: 'like', label: 'Me encanta', icon: 'heart' },
  { key: 'apoya', label: 'Apoya', icon: 'thumbs-up' },
  { key: 'importante', label: 'Importante', icon: 'alert-circle' },
  { key: 'sorprende', label: 'Sorprende', icon: 'sparkles' },
];
const AVATAR_FALLBACK_COLORS = [
  '#2563EB',
  '#7C3AED',
  '#0F766E',
  '#B45309',
  '#BE123C',
  '#0369A1',
  '#4D7C0F',
  '#6D28D9',
] as const;

const getAvatarFallbackColor = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_FALLBACK_COLORS.length;
  return AVATAR_FALLBACK_COLORS[index];
};

export default function CommunityScreen() {
  const router = useRouter();
  const { postId } = useLocalSearchParams<{ postId?: string }>();
  const insets = useSafeAreaInsets();

  const feedOffset = useRef(new Animated.Value(0)).current;
  const locatePulse = useRef(new Animated.Value(0)).current;
  const dotsCycle = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView | null>(null);
  const composerScrollRef = useRef<ScrollView | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, CommunityProfile>>({});
  const [commentsByPost, setCommentsByPost] = useState<Record<string, CommunityComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [openCommentsByPost, setOpenCommentsByPost] = useState<Record<string, boolean>>({});
  const [content, setContent] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [severity, setSeverity] = useState<PostSeverity>('informacion');
  const [communityTableMissing, setCommunityTableMissing] = useState(false);
  const [commentsTableMissing, setCommentsTableMissing] = useState(false);
  const [reactionsTableMissing, setReactionsTableMissing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [locationMessage, setLocationMessage] = useState('');
  const [draftComment, setDraftComment] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [editingCommentTarget, setEditingCommentTarget] = useState<CommentTarget | null>(null);
  const [replyingCommentTarget, setReplyingCommentTarget] = useState<CommentTarget | null>(null);
  const [activeSeverityFilter, setActiveSeverityFilter] = useState<PostSeverity | 'todas'>('todas');
  const [feedSortMode, setFeedSortMode] = useState<FeedSortMode>('priority');
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [likedByPost, setLikedByPost] = useState<Record<string, boolean>>({});
  const [reactionByPost, setReactionByPost] = useState<Record<string, ReactionType>>({});
  const [reactionCountByPost, setReactionCountByPost] = useState<Record<string, number>>({});
  const [reactionPickerPostId, setReactionPickerPostId] = useState<string | null>(null);
  const [reactionSavingByPost, setReactionSavingByPost] = useState<Record<string, boolean>>({});
  const [mentionSuggestions, setMentionSuggestions] = useState<CommunityProfile[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [activeMentionPostId, setActiveMentionPostId] = useState<string | null>(null);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [commentSavingByPost, setCommentSavingByPost] = useState<Record<string, boolean>>({});

  const guestLayout = !loading && !isLoggedIn;

  const goToLogin = () => {
    router.push('/login?force=1');
  };

  useEffect(() => {
    void bootstrap();
  }, []);

  /** Al volver a esta pestaña, el scroll vuelve arriba (publicaciones más recientes primero). */
  useFocusEffect(
    useCallback(() => {
      const tick = requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({ x: 0, y: 0, animated: false });
      });
      return () => cancelAnimationFrame(tick);
    }, [])
  );

  useEffect(() => {
    if (!isLoggedIn || !userId) return;

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const queueRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void loadPosts();
      }, 250);
    };

    const channel = supabase
      .channel(`community-live-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'community_posts' },
        () => queueRefresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'community_comments' },
        () => queueRefresh()
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [isLoggedIn, userId]);

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

  useEffect(() => {
    if (locationStatus !== 'loading') {
      locatePulse.stopAnimation();
      dotsCycle.stopAnimation();
      return;
    }

    locatePulse.setValue(0);
    dotsCycle.setValue(0);

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(locatePulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(locatePulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    const dotsLoop = Animated.loop(
      Animated.timing(dotsCycle, {
        toValue: 3,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    pulseLoop.start();
    dotsLoop.start();

    return () => {
      pulseLoop.stop();
      dotsLoop.stop();
    };
  }, [locationStatus, locatePulse, dotsCycle]);

  useEffect(() => {
    if (!mentionQuery || !activeMentionPostId) {
      setMentionSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,name,avatar_url')
        .ilike('name', `${mentionQuery}%`)
        .limit(8);
      if (error) {
        setMentionSuggestions([]);
        return;
      }
      setMentionSuggestions((data as CommunityProfile[] | null) ?? []);
    }, 200);
    return () => clearTimeout(timer);
  }, [mentionQuery, activeMentionPostId]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const keepFocusedInputVisible = (target: unknown) => {
    const nodeHandle = typeof target === 'number' ? target : findNodeHandle(target as never);
    if (!nodeHandle) return;
    setTimeout(() => {
      scrollViewRef.current?.scrollResponderScrollNativeHandleToKeyboard(nodeHandle, 120, true);
    }, 120);
  };

  const keepComposerInputVisible = () => {
    setTimeout(() => {
      composerScrollRef.current?.scrollToEnd({ animated: true });
    }, 120);
  };

  const getSeverityRank = (sev?: PostSeverity) => {
    if (sev === 'grave') return 3;
    if (sev === 'alerta') return 2;
    return 1;
  };

  const visiblePosts = useMemo(() => {
    const filtered = activeSeverityFilter === 'todas'
      ? [...posts]
      : posts.filter((post) => (post.severity ?? 'informacion') === activeSeverityFilter);

    if (feedSortMode === 'recent') {
      return filtered.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    const now = Date.now();
    const recentWindowMs = 1000 * 60 * 60 * 24;
    return filtered.sort((a, b) => {
      const at = new Date(a.created_at).getTime();
      const bt = new Date(b.created_at).getTime();
      const aRecent = now - at <= recentWindowMs;
      const bRecent = now - bt <= recentWindowMs;
      if (aRecent && bRecent) {
        const sevDiff = getSeverityRank(b.severity) - getSeverityRank(a.severity);
        if (sevDiff !== 0) return sevDiff;
      }
      return bt - at;
    });
  }, [posts, activeSeverityFilter, feedSortMode]);

  const toggleLike = (postIdValue: string) => {
    if (!userId) {
      NativeAlert.alert('Reacciones', 'Inicia sesion para dar me gusta.');
      return;
    }
    if (reactionsTableMissing) {
      NativeAlert.alert('Reacciones', 'Falta crear la tabla community_reactions en Supabase.');
      return;
    }
    if (reactionSavingByPost[postIdValue]) return;

    const nextLike = !likedByPost[postIdValue];
    setReactionSavingByPost((prev) => ({ ...prev, [postIdValue]: true }));
    setLikedByPost((prev) => ({ ...prev, [postIdValue]: nextLike }));
    setReactionByPost((prev) => ({ ...prev, [postIdValue]: nextLike ? 'like' : prev[postIdValue] }));
    setReactionCountByPost((counts) => ({
      ...counts,
      [postIdValue]: Math.max(0, (counts[postIdValue] ?? 0) + (nextLike ? 1 : -1)),
    }));

    (async () => {
      try {
        if (nextLike) {
          const { error } = await supabase
            .from('community_reactions')
            .upsert({
              post_id: postIdValue,
              user_id: userId,
              reaction: 'like',
            }, { onConflict: 'post_id,user_id' });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('community_reactions')
            .delete()
            .eq('post_id', postIdValue)
            .eq('user_id', userId);
          if (error) throw error;
        }
      } catch (error: any) {
        console.warn('[Community][toggleLike] Error:', error?.message);
        await loadReactionsForPosts([postIdValue]);
      } finally {
        setReactionSavingByPost((prev) => ({ ...prev, [postIdValue]: false }));
      }
    })();
  };

  const setReaction = (postIdValue: string, reaction: ReactionType) => {
    if (!userId) {
      NativeAlert.alert('Reacciones', 'Inicia sesion para reaccionar.');
      return;
    }
    if (reactionsTableMissing) {
      NativeAlert.alert('Reacciones', 'Falta crear la tabla community_reactions en Supabase.');
      return;
    }
    if (reactionSavingByPost[postIdValue]) return;

    setReactionSavingByPost((prev) => ({ ...prev, [postIdValue]: true }));
    setReactionByPost((prev) => ({ ...prev, [postIdValue]: reaction }));
    setLikedByPost((prev) => ({ ...prev, [postIdValue]: true }));
    setReactionCountByPost((counts) => {
      const current = counts[postIdValue] ?? 0;
      return { ...counts, [postIdValue]: current > 0 ? current : 1 };
    });
    setReactionPickerPostId(null);

    (async () => {
      try {
        const { error } = await supabase
          .from('community_reactions')
          .upsert({
            post_id: postIdValue,
            user_id: userId,
            reaction,
          }, { onConflict: 'post_id,user_id' });
        if (error) throw error;
      } catch (error: any) {
        console.warn('[Community][setReaction] Error:', error?.message);
        await loadReactionsForPosts([postIdValue]);
      } finally {
        setReactionSavingByPost((prev) => ({ ...prev, [postIdValue]: false }));
      }
    })();
  };

  const onCommentDraftChange = (postIdValue: string, value: string) => {
    setCommentDrafts((prev) => ({ ...prev, [postIdValue]: value }));
    const match = value.match(/(?:^|\s)@([a-zA-Z0-9_]{1,30})$/);
    if (!match) {
      setActiveMentionPostId(null);
      setMentionQuery('');
      return;
    }
    setActiveMentionPostId(postIdValue);
    setMentionQuery(match[1]);
  };

  const insertMention = (postIdValue: string, pickedName: string) => {
    const current = commentDrafts[postIdValue] ?? '';
    const next = current.replace(/(?:^|\s)@([a-zA-Z0-9_]{1,30})$/, (full) => {
      const leadingSpace = full.startsWith(' ') ? ' ' : '';
      return `${leadingSpace}@${pickedName} `;
    });
    setCommentDrafts((prev) => ({ ...prev, [postIdValue]: next }));
    setActiveMentionPostId(null);
    setMentionQuery('');
    setMentionSuggestions([]);
  };

  const openPostMenu = (post: CommunityPost) => {
    if (post.user_id !== userId) {
      NativeAlert.alert('Opciones', 'Esta publicación no te pertenece.');
      return;
    }
    NativeAlert.alert('Opciones de publicación', 'Selecciona una acción', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Editar', onPress: () => startEdit(post) },
      { text: 'Eliminar', style: 'destructive', onPress: () => confirmDeletePost(post) },
    ]);
  };

  const renderCommentWithMentions = (text: string) => {
    const parts = text.split(/(@[a-zA-Z0-9_]+)/g);
    return (
      <Text style={styles.commentText}>
        {parts.map((part, index) => {
          const isMention = /^@[a-zA-Z0-9_]+$/.test(part);
          return (
            <Text key={`${part}-${index}`} style={isMention ? styles.commentMentionText : undefined}>
              {part}
            </Text>
          );
        })}
      </Text>
    );
  };

  const bootstrap = async () => {
    try {
      const session = await getSession();
      const uid = (session?.user?.id as string | undefined) ?? null;
      setIsLoggedIn(Boolean(uid));
      setUserId(uid);
      if (uid) await loadPosts();
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
        await loadPosts();
      } else {
        setPosts([]);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const loadPosts = async () => {
    const { data, error } = await supabase
      .from('community_posts')
      .select('*')
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
    const requestedPostId = typeof postId === 'string' ? postId : undefined;
    if (requestedPostId) {
      const selected = normalized.find((post) => post.id === requestedPostId);
      if (selected) {
        const rest = normalized.filter((post) => post.id !== requestedPostId);
        setPosts([selected, ...rest]);
      } else {
        setPosts(normalized);
      }
    } else {
      setPosts(normalized);
    }
    const comments = await loadCommentsForPosts(normalized.map((post) => post.id));
    await loadProfilesForPosts(normalized, comments);
    await loadReactionsForPosts(normalized.map((post) => post.id));
  };

  const loadReactionsForPosts = async (postIds: string[]) => {
    if (!userId || postIds.length === 0) {
      setReactionCountByPost({});
      setLikedByPost({});
      setReactionByPost({});
      return;
    }

    const { data, error } = await supabase
      .from('community_reactions')
      .select('post_id,user_id,reaction')
      .in('post_id', postIds);

    if (error) {
      const missingTable =
        error.code === 'PGRST205' ||
        error.message?.includes("Could not find the table 'public.community_reactions'");
      if (missingTable) {
        setReactionsTableMissing(true);
        console.warn('[Community][loadReactions] Tabla faltante: public.community_reactions');
      } else {
        console.warn('[Community][loadReactions] Error inesperado:', error.message);
      }
      setReactionCountByPost({});
      setLikedByPost({});
      setReactionByPost({});
      return;
    }

    setReactionsTableMissing(false);
    const counts: Record<string, number> = {};
    const myLikes: Record<string, boolean> = {};
    const myReactions: Record<string, ReactionType> = {};

    (data ?? []).forEach((row: any) => {
      const postIdValue = row.post_id as string;
      counts[postIdValue] = (counts[postIdValue] ?? 0) + 1;
      if (row.user_id === userId) {
        myLikes[postIdValue] = true;
        myReactions[postIdValue] = (row.reaction as ReactionType) ?? 'like';
      }
    });

    setReactionCountByPost(counts);
    setLikedByPost(myLikes);
    setReactionByPost(myReactions);
  };

  const loadProfilesForPosts = async (
    postItems: CommunityPost[],
    commentItems: CommunityComment[]
  ) => {
    const postUserIds = postItems.map((post) => post.user_id);
    const commentUserIds = commentItems.map((comment) => comment.user_id);
    const uniqueIds = Array.from(new Set([...postUserIds, ...commentUserIds].filter(Boolean)));
    if (uniqueIds.length === 0) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('id,name,avatar_url')
      .in('id', uniqueIds);

    if (error) {
      console.warn('[Community][loadProfiles] Error:', error.message);
      return;
    }

    const next = (data ?? []).reduce((acc: Record<string, CommunityProfile>, row: any) => {
      acc[row.id] = {
        id: row.id,
        name: row.name ?? null,
        avatar_url: row.avatar_url ?? null,
      };
      return acc;
    }, {});

    setProfilesById((prev) => ({ ...prev, ...next }));
  };

  const loadCommentsForPosts = async (postIds: string[]) => {
    if (postIds.length === 0) {
      setCommentsByPost({});
      return [] as CommunityComment[];
    }

    const { data, error } = await supabase
      .from('community_comments')
      .select('*')
      .in('post_id', postIds)
      .order('created_at', { ascending: true });

    if (error) {
      const missingTable =
        error.code === 'PGRST205' ||
        error.message?.includes("Could not find the table 'public.community_comments'");
      if (missingTable) {
        setCommentsTableMissing(true);
        console.warn('[Community][loadComments] Tabla faltante: public.community_comments');
      } else {
        console.warn('[Community][loadComments] Error inesperado:', error.message);
      }
      setCommentsByPost({});
      return [] as CommunityComment[];
    }

    setCommentsTableMissing(false);
    const grouped = (data ?? []).reduce((acc: Record<string, CommunityComment[]>, row: any) => {
      const key = row.post_id as string;
      if (!acc[key]) acc[key] = [];
      acc[key].push({
        id: row.id,
        post_id: row.post_id,
        user_id: row.user_id,
        content: row.content,
        created_at: row.created_at,
        parent_comment_id: typeof row.parent_comment_id === 'string' ? row.parent_comment_id : null,
      });
      return acc;
    }, {});
    setCommentsByPost(grouped);
    return Object.values(grouped).flat();
  };

  const loadAddressFromApi = async () => {
    setLocationStatus('loading');
    setLocationMessage('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationStatus('error');
        setLocationMessage('Permiso de ubicacion denegado.');
        return;
      }
      const coords = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const data = await fetchAddress(coords.coords.latitude, coords.coords.longitude);
      const address = data?.display_name ?? null;
      const normalized = address
        ? address.split(',').slice(0, 3).join(',').trim()
        : `${coords.coords.latitude.toFixed(4)}, ${coords.coords.longitude.toFixed(4)}`;
      setContent(normalized);
      setLocationStatus('ready');
    } catch {
      setLocationStatus('error');
      setLocationMessage('No se pudo obtener la ubicacion automaticamente.');
    }
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
      if (!editingId) await loadAddressFromApi();
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
      if (!editingId) await loadAddressFromApi();
    }
  };

  const limpiarFormulario = () => {
    setContent('');
    setImageUri(null);
    setImageBase64(null);
    setImageMimeType(null);
    setEditingId(null);
    setSeverity('informacion');
    setDraftComment('');
    setLocationStatus('idle');
    setLocationMessage('');
  };

  const abrirComposerNuevo = async () => {
    setEditingId(null);
    setImageUri(null);
    setImageBase64(null);
    setImageMimeType(null);
    setSeverity('informacion');
    setDraftComment('');
    setLocationStatus('loading');
    setLocationMessage('');
    setComposerOpen(true);
    await loadAddressFromApi();
  };

  const cerrarComposer = () => {
    setComposerOpen(false);
  };

  const savePost = async () => {
    if (saving) return;
    if (!userId) return;
    if (!imageUri) {
      NativeAlert.alert('Advertencia', 'Debes seleccionar o tomar una imagen.');
      return;
    }
    const normalizedLocation = content.trim();
    if (locationStatus === 'loading') {
      NativeAlert.alert('Ubicacion', 'Espera a que se detecte la ubicacion automaticamente.');
      return;
    }
    if (!normalizedLocation || normalizedLocation.length < 6) {
      NativeAlert.alert('Advertencia', 'No se pudo detectar una ubicacion valida.');
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
        let insertedId: string | undefined;
        let insertError: { message?: string } | null = null;

        const { data: inserted, error } = await supabase
          .from('community_posts')
          .insert({
          user_id: userId,
          content: normalizedLocation,
          image_url: imageUrlToSave,
          image_path: imagePathToSave,
            severity,
          })
          .select('id')
          .single();
        if (error && error.message?.includes('column')) {
          const fallback = await supabase
            .from('community_posts')
            .insert({
            user_id: userId,
            content: normalizedLocation,
            })
            .select('id')
            .single();
          insertError = fallback.error ?? null;
          insertedId = (fallback.data as { id?: string } | null)?.id;
        } else {
          insertError = error ?? null;
          insertedId = (inserted as { id?: string } | null)?.id;
        }
        if (insertError) throw insertError;

        if (!insertedId) {
          const latest = await supabase
            .from('community_posts')
            .select('id')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          insertedId = (latest.data as { id?: string } | null)?.id;
        }

        if (draftComment.trim() && !commentsTableMissing && insertedId) {
          const { error: commentError } = await supabase.from('community_comments').insert({
            post_id: insertedId,
            user_id: userId,
            content: draftComment.trim(),
          });
          if (commentError) {
            NativeAlert.alert(
              'Comentario no guardado',
              commentError.message ?? 'No se pudo guardar el comentario inicial.'
            );
          }
        } else if (draftComment.trim() && !commentsTableMissing && !insertedId) {
          console.warn('[Community][savePost] No se pudo resolver el id del post para comentar.');
        }
        console.log('[Community][savePost] Insert DB OK');
      }
      limpiarFormulario();
      setComposerOpen(false);
      await loadPosts();
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
    setLocationStatus('ready');
    setComposerOpen(true);
  };

  const submitComment = async (postId: string) => {
    if (!userId) return;
    const draft = commentDrafts[postId]?.trim() ?? '';
    if (!draft) return;
    if (commentSavingByPost[postId]) return;
    if (commentsTableMissing) {
      NativeAlert.alert('Comentarios', 'Falta crear la tabla community_comments en Supabase.');
      return;
    }

    const isEditing = editingCommentTarget?.postId === postId;
    const replyTarget = replyingCommentTarget?.postId === postId ? replyingCommentTarget : null;
    const contentToSave = replyTarget ? `@${replyTarget.authorName} ${draft}` : draft;

    setCommentSavingByPost((prev) => ({ ...prev, [postId]: true }));
    let error: { message?: string } | null = null;
    try {
      if (isEditing) {
        const result = await supabase
          .from('community_comments')
          .update({ content: contentToSave })
          .eq('id', editingCommentTarget.commentId)
          .eq('user_id', userId);
        error = result.error ?? null;
      } else if (replyTarget) {
        const withParent = await supabase.from('community_comments').insert({
          post_id: postId,
          user_id: userId,
          content: contentToSave,
          parent_comment_id: replyTarget.commentId,
        });
        if (withParent.error?.message?.includes('column')) {
          const fallback = await supabase.from('community_comments').insert({
            post_id: postId,
            user_id: userId,
            content: contentToSave,
          });
          error = fallback.error ?? null;
        } else {
          error = withParent.error ?? null;
        }
      } else {
        const result = await supabase.from('community_comments').insert({
          post_id: postId,
          user_id: userId,
          content: contentToSave,
        });
        error = result.error ?? null;
      }
    } finally {
      setCommentSavingByPost((prev) => ({ ...prev, [postId]: false }));
    }

    if (error) {
      NativeAlert.alert('No se pudo comentar', error.message ?? 'Intenta nuevamente.');
      return;
    }

    setCommentDrafts((prev) => ({ ...prev, [postId]: '' }));
    if (activeMentionPostId === postId) {
      setActiveMentionPostId(null);
      setMentionQuery('');
      setMentionSuggestions([]);
    }
    if (isEditing) setEditingCommentTarget(null);
    if (replyTarget) setReplyingCommentTarget(null);
    await loadPosts();
  };

  const startReplyToComment = (postId: string, comment: CommunityComment) => {
    const authorName = profilesById[comment.user_id]?.name ?? 'Usuario';
    setReplyingCommentTarget({ postId, commentId: comment.id, authorName });
    setEditingCommentTarget(null);
    setOpenCommentsByPost((prev) => ({ ...prev, [postId]: true }));
  };

  const startEditComment = (postId: string, comment: CommunityComment) => {
    const authorName = profilesById[comment.user_id]?.name ?? 'Usuario';
    setEditingCommentTarget({ postId, commentId: comment.id, authorName });
    setReplyingCommentTarget(null);
    setCommentDrafts((prev) => ({ ...prev, [postId]: comment.content }));
    setOpenCommentsByPost((prev) => ({ ...prev, [postId]: true }));
  };

  const deleteComment = (postId: string, commentId: string) => {
    if (!userId) return;
    NativeAlert.alert('Eliminar comentario', '¿Seguro que deseas eliminar tu comentario?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('community_comments')
            .delete()
            .eq('id', commentId)
            .eq('user_id', userId);

          if (error) {
            NativeAlert.alert('No se pudo eliminar', error.message ?? 'Intenta nuevamente.');
            return;
          }

          if (editingCommentTarget?.commentId === commentId) {
            setEditingCommentTarget(null);
            setCommentDrafts((prev) => ({ ...prev, [postId]: '' }));
          }
          if (replyingCommentTarget?.commentId === commentId) {
            setReplyingCommentTarget(null);
          }
          await loadPosts();
        },
      },
    ]);
  };

  const severityMeta = useMemo(
    () => ({
      informacion: {
        label: 'Informacion',
        icon: 'ℹ️',
        bg: 'rgba(56,189,248,0.18)',
        border: 'rgba(56,189,248,0.7)',
        text: '#e0f2fe',
        glow: 'rgba(56,189,248,0.35)',
      },
      alerta: {
        label: 'Alerta',
        icon: '⚠️',
        bg: 'rgba(251,191,36,0.2)',
        border: 'rgba(251,191,36,0.75)',
        text: '#fef3c7',
        glow: 'rgba(251,191,36,0.35)',
      },
      grave: {
        label: 'Grave',
        icon: '🚨',
        bg: 'rgba(239,68,68,0.2)',
        border: 'rgba(239,68,68,0.7)',
        text: '#fee2e2',
        glow: 'rgba(239,68,68,0.4)',
      },
    }),
    []
  );

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
      await loadPosts();
      if (editingId === id) {
        limpiarFormulario();
      }
    } catch (error: any) {
      NativeAlert.alert('No se pudo eliminar', error?.message ?? 'Intenta nuevamente.');
    }
  };

  const confirmDeletePost = (post: CommunityPost) => {
    NativeAlert.alert(
      'Eliminar publicación',
      '¿Seguro que deseas eliminar esta publicación de la comunidad?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            void deletePost(post.id);
          },
        },
      ]
    );
  };

  const guestBottomPad = Math.max(insets.bottom, 12) + 14;

  const titleSection = (
    <View style={styles.titleBlock}>
      <View style={styles.titleIconWrap}>
        <Ionicons name="people-outline" size={22} color={ACCENT} />
      </View>
      <View style={styles.titleTextCol}>
        <Text style={styles.eyebrow}>Ciudadanos</Text>
        <Text style={styles.title}>Comunidad</Text>
        <Text style={styles.subtitle}>Publicaciones y reportes con ubicación.</Text>
      </View>
      {isLoggedIn && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nueva publicación"
          style={({ pressed }) => [
            styles.headerNewBtn,
            pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
          ]}
          onPress={() => {
            if (composerOpen) {
              cerrarComposer();
              return;
            }
            void abrirComposerNuevo();
          }}
        >
          <Ionicons name={composerOpen ? 'close' : 'add'} size={26} color="#0c1222" />
        </Pressable>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 52}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={styles.bgGlowTop} />
      <View style={styles.bgGlowBottom} />

      {guestLayout ? (
        <View style={styles.guestRoot}>
          <View
            style={[
              styles.guestInner,
              {
                paddingTop: insets.top + 14,
                paddingBottom: guestBottomPad,
              },
            ]}
          >
            {titleSection}
            <View style={[styles.skeletonWrap, styles.skeletonWrapGuest]}>
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
          </View>
        </View>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          alwaysBounceVertical
          overScrollMode="always"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.container,
            {
              paddingTop: insets.top + 14,
              paddingBottom:
                Math.max(insets.bottom, 16) + 32 + (keyboardHeight > 0 ? keyboardHeight + 20 : 0),
            },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refreshFeed}
              tintColor={ACCENT}
              colors={[ACCENT]}
              progressViewOffset={insets.top + 52}
            />
          }
        >
          {titleSection}

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={ACCENT} />
          </View>
        ) : (
          <>
          <View style={styles.postsListOutside}>
            <View style={styles.feedSectionHeader}>
              <View>
                <Text style={styles.feedSectionTitle}>Publicaciones recientes</Text>
                <Text style={styles.feedSectionSub}>
                  {feedSortMode === 'priority' ? 'Prioridad grave/alerta + recencia' : 'Ordenadas por fecha reciente'}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.feedFilterBtn, pressed && { opacity: 0.82 }]}
                onPress={() => setFilterModalOpen(true)}
              >
                <Ionicons name="filter-outline" size={18} color={ACCENT} />
              </Pressable>
            </View>
            {visiblePosts.length === 0 ? (
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
                <Text style={styles.emptyPostsText}>Aun no hay publicaciones.</Text>
              </View>
            ) : (
              visiblePosts.map((post) => {
                const postComments = [...(commentsByPost[post.id] ?? [])].sort(
                  (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                );
                const commentIds = new Set(postComments.map((item) => item.id));
                const childrenByParent = postComments.reduce(
                  (acc: Record<string, CommunityComment[]>, item) => {
                    if (!item.parent_comment_id) return acc;
                    if (!acc[item.parent_comment_id]) acc[item.parent_comment_id] = [];
                    acc[item.parent_comment_id].push(item);
                    return acc;
                  },
                  {}
                );
                const rootComments = postComments.filter(
                  (item) => !item.parent_comment_id || !commentIds.has(item.parent_comment_id)
                );

                const renderCommentNode = (comment: CommunityComment, depth = 0) => {
                  const children = [...(childrenByParent[comment.id] ?? [])].sort(
                    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                  );
                  const hasChildren = children.length > 0;
                  const isReply = depth > 0;
                  const isOwnerComment = comment.user_id === post.user_id;

                  return (
                    <View
                      key={comment.id}
                      style={[
                        styles.commentTreeNode,
                        isReply && styles.replyTreeNode,
                        isReply && { marginLeft: Math.min(depth, 4) * 16 },
                      ]}
                    >
                      {isReply ? <View style={styles.replyTreeConnector} /> : null}
                      <View
                        style={[
                          styles.commentRow,
                          isOwnerComment && styles.commentRowOwner,
                          isReply && styles.replyRow,
                        ]}
                      >
                        {profilesById[comment.user_id]?.avatar_url ? (
                          <Image
                            source={{ uri: profilesById[comment.user_id].avatar_url as string }}
                            style={isReply ? styles.replyAvatar : styles.commentAvatar}
                          />
                        ) : (
                          <View
                            style={[
                              isReply ? styles.replyAvatarFallback : styles.commentAvatarFallback,
                              { backgroundColor: getAvatarFallbackColor(comment.user_id) },
                            ]}
                          >
                            <Ionicons name="person" size={isReply ? 11 : 12} color="#FFFFFF" />
                          </View>
                        )}
                        <View style={styles.commentBody}>
                          <View style={styles.commentAuthorRow}>
                            <Text style={styles.commentAuthor}>
                              {profilesById[comment.user_id]?.name ?? 'Usuario'}
                            </Text>
                            {isOwnerComment ? (
                              <View style={styles.commentAuthorBadge}>
                                <Text style={styles.commentAuthorBadgeText}>Autor</Text>
                              </View>
                            ) : null}
                          </View>
                          {renderCommentWithMentions(comment.content)}
                          <Text style={styles.commentDate}>
                            {new Date(comment.created_at).toLocaleString('es-ES')}
                          </Text>
                          <View style={styles.commentActions}>
                            <Pressable
                              style={styles.commentActionBtn}
                              onPress={() => startReplyToComment(post.id, comment)}
                            >
                              <Text style={styles.commentActionText}>Responder</Text>
                            </Pressable>
                            {comment.user_id === userId ? (
                              <>
                                <Pressable
                                  style={styles.commentActionBtn}
                                  onPress={() => startEditComment(post.id, comment)}
                                >
                                  <Text style={styles.commentActionText}>Editar</Text>
                                </Pressable>
                                <Pressable
                                  style={[styles.commentActionBtn, styles.commentActionDanger]}
                                  onPress={() => deleteComment(post.id, comment.id)}
                                >
                                  <Text style={styles.commentActionText}>Eliminar</Text>
                                </Pressable>
                              </>
                            ) : null}
                          </View>
                        </View>
                      </View>

                      {hasChildren ? (
                        <View style={styles.replyChildrenWrap}>
                          {children.map((child) => renderCommentNode(child, depth + 1))}
                        </View>
                      ) : null}
                    </View>
                  );
                };

                const authorName = profilesById[post.user_id]?.name ?? (post.user_id === userId ? 'Tú' : 'Usuario');
                const primaryComment = postComments.find((item) => item.user_id === post.user_id)?.content ?? '';
                const totalComments = (commentsByPost[post.id] ?? []).length;
                const latestCommentPreview = postComments.length > 0
                  ? postComments[postComments.length - 1].content
                  : 'Sin comentarios';
                const myReaction = reactionByPost[post.id];
                const currentReactionIcon = myReaction === 'apoya'
                  ? 'thumbs-up'
                  : myReaction === 'importante'
                    ? 'alert-circle'
                    : myReaction === 'sorprende'
                      ? 'sparkles'
                      : 'heart';

                return (
                <View key={post.id} style={styles.postCard}>
                  <View style={styles.feedHeader}>
                    <View
                      style={[
                        styles.avatarShell,
                        { backgroundColor: getAvatarFallbackColor(post.user_id) },
                      ]}
                    >
                      {profilesById[post.user_id]?.avatar_url ? (
                        <Image
                          source={{ uri: profilesById[post.user_id].avatar_url as string }}
                          style={styles.avatarImage}
                        />
                      ) : (
                        <View style={styles.avatarFallback}>
                          <Ionicons name="person" size={14} color="#FFFFFF" />
                        </View>
                      )}
                    </View>
                    <View style={styles.feedHeaderInfo}>
                      <Text style={styles.feedUser}>{authorName}</Text>
                      <Text style={styles.feedUserMeta} numberOfLines={1}>
                        {post.content || 'Ubicación no disponible'}
                      </Text>
                    </View>
                    <View style={styles.feedHeaderRight}>
                      <View
                        style={[
                          styles.feedBadge,
                          {
                            backgroundColor: severityMeta[post.severity ?? 'informacion'].bg,
                            borderColor: severityMeta[post.severity ?? 'informacion'].border,
                            shadowColor: severityMeta[post.severity ?? 'informacion'].glow,
                          },
                        ]}
                      >
                        <Text style={styles.feedBadgeIcon}>
                          {severityMeta[post.severity ?? 'informacion'].icon}
                        </Text>
                        <Text
                          style={[
                            styles.feedBadgeText,
                            { color: severityMeta[post.severity ?? 'informacion'].text },
                          ]}
                        >
                          {severityMeta[post.severity ?? 'informacion'].label}
                        </Text>
                      </View>
                      <Pressable
                        style={({ pressed }) => [styles.postMenuBtn, pressed && { opacity: 0.8 }]}
                        onPress={() => openPostMenu(post)}
                      >
                        <Ionicons name="ellipsis-horizontal" size={18} color="rgba(226,232,240,0.92)" />
                      </Pressable>
                    </View>
                  </View>
                  {post.image_url ? (
                    <Pressable
                      onPress={() => setLightboxUri(post.image_url ?? null)}
                      accessibilityRole="imagebutton"
                      accessibilityLabel="Ampliar imagen de la publicación"
                    >
                      <Image source={{ uri: post.image_url }} style={styles.postImage} />
                    </Pressable>
                  ) : null}
                  {primaryComment ? (
                    <Text style={styles.postCaption} numberOfLines={4} ellipsizeMode="tail">
                      {primaryComment}
                    </Text>
                  ) : null}
                  <Text style={styles.postDate}>
                    {new Date(post.created_at).toLocaleString('es-ES')}
                  </Text>
                  <View style={styles.socialBar}>
                    <Pressable
                      onPress={() => toggleLike(post.id)}
                      onLongPress={() => setReactionPickerPostId(post.id)}
                      disabled={reactionSavingByPost[post.id]}
                      style={({ pressed }) => [
                        styles.socialActionBtn,
                        pressed && { opacity: 0.8 },
                        reactionSavingByPost[post.id] && { opacity: 0.6 },
                      ]}
                    >
                      <Ionicons
                        name={currentReactionIcon as any}
                        size={18}
                        color={likedByPost[post.id] ? '#fb7185' : 'rgba(226,232,240,0.8)'}
                      />
                      <Text style={styles.socialActionText}>{reactionCountByPost[post.id] ?? 0}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        setOpenCommentsByPost((prev) => ({ ...prev, [post.id]: !prev[post.id] }))
                      }
                      style={({ pressed }) => [styles.socialActionBtn, pressed && { opacity: 0.8 }]}
                    >
                      <Ionicons name="chatbubble-outline" size={18} color="rgba(226,232,240,0.88)" />
                      <Text style={styles.socialActionText}>{totalComments}</Text>
                    </Pressable>
                  </View>

                  <View style={styles.commentsWrap}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.commentsHeader,
                        pressed && { opacity: 0.85 },
                      ]}
                      onPress={() =>
                        setOpenCommentsByPost((prev) => ({
                          ...prev,
                          [post.id]: !prev[post.id],
                        }))
                      }
                    >
                      <Text style={styles.commentsTitle} numberOfLines={1} ellipsizeMode="tail">
                        {latestCommentPreview}
                      </Text>
                      <View style={styles.commentsMeta}>
                        <Text style={styles.commentsCount}>
                          {(commentsByPost[post.id] ?? []).length}
                        </Text>
                        <Ionicons
                          name={openCommentsByPost[post.id] ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color="rgba(241,245,249,0.9)"
                        />
                      </View>
                    </Pressable>

                    {openCommentsByPost[post.id] ? (
                      <View style={styles.commentsPanel}>
                        {postComments.length === 0 ? (
                          <Text style={styles.commentsEmpty}>Sin comentarios.</Text>
                        ) : (
                          rootComments.map((comment) => renderCommentNode(comment))
                        )}

                        {isLoggedIn ? (
                          <View style={styles.commentComposer}>
                            {replyingCommentTarget?.postId === post.id ? (
                              <View style={styles.commentTargetBanner}>
                                <Text style={styles.commentTargetText}>
                                  Respondiendo a {replyingCommentTarget.authorName}
                                </Text>
                                <Pressable onPress={() => setReplyingCommentTarget(null)}>
                                  <Text style={styles.commentTargetCancel}>Cancelar</Text>
                                </Pressable>
                              </View>
                            ) : null}
                            {editingCommentTarget?.postId === post.id ? (
                              <View style={styles.commentTargetBanner}>
                                <Text style={styles.commentTargetText}>Editando tu comentario</Text>
                                <Pressable
                                  onPress={() => {
                                    setEditingCommentTarget(null);
                                    setCommentDrafts((prev) => ({ ...prev, [post.id]: '' }));
                                  }}
                                >
                                  <Text style={styles.commentTargetCancel}>Cancelar</Text>
                                </Pressable>
                              </View>
                            ) : null}
                            <TextInput
                              style={styles.commentInput}
                              value={commentDrafts[post.id] ?? ''}
                              onChangeText={(value) => onCommentDraftChange(post.id, value)}
                              onFocus={(event) => keepFocusedInputVisible(event.target)}
                              placeholder="Escribe un comentario"
                              placeholderTextColor="rgba(255,255,255,0.45)"
                              multiline
                            />
                            {activeMentionPostId === post.id && mentionSuggestions.length > 0 ? (
                              <View style={styles.mentionBox}>
                                {mentionSuggestions.map((person) => (
                                  <Pressable
                                    key={person.id}
                                    style={({ pressed }) => [styles.mentionItem, pressed && styles.mentionItemPressed]}
                                    onPress={() => insertMention(post.id, person.name ?? 'usuario')}
                                  >
                                    <Text style={styles.mentionItemText}>@{person.name ?? 'usuario'}</Text>
                                  </Pressable>
                                ))}
                              </View>
                            ) : null}
                            <Pressable
                              style={({ pressed }) => [
                                styles.commentBtn,
                                pressed && { opacity: 0.85 },
                                commentSavingByPost[post.id] && { opacity: 0.6 },
                              ]}
                              onPress={() => submitComment(post.id)}
                              disabled={commentSavingByPost[post.id]}
                            >
                              <Text style={styles.commentBtnText}>
                                {commentSavingByPost[post.id]
                                  ? 'Enviando...'
                                  : editingCommentTarget?.postId === post.id
                                    ? 'Guardar'
                                    : 'Comentar'}
                              </Text>
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </View>
              );
              })
            )}
          </View>
          </>
        )}
      </ScrollView>
      )}

      {/* FAB removido: el botón "+" en el header (titleBlock) abre el composer. */}

      <Modal
        visible={isLoggedIn && filterModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalOpen(false)}
      >
        <View style={styles.overlaySheet}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFilterModalOpen(false)} />
          <View style={styles.filterCard}>
            <Text style={styles.filterTitle}>Filtrar publicaciones</Text>
            <View style={styles.filterRow}>
              {(['todas', 'grave', 'alerta', 'informacion'] as const).map((item) => (
                <Pressable
                  key={item}
                  style={({ pressed }) => [
                    styles.filterPill,
                    activeSeverityFilter === item && styles.filterPillActive,
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => setActiveSeverityFilter(item)}
                >
                  <Text style={styles.filterPillText}>{item[0].toUpperCase() + item.slice(1)}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.filterSortRow}>
              <Pressable
                style={({ pressed }) => [styles.sortBtn, feedSortMode === 'priority' && styles.sortBtnActive, pressed && { opacity: 0.85 }]}
                onPress={() => setFeedSortMode('priority')}
              >
                <Text style={styles.sortBtnText}>Prioridad</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.sortBtn, feedSortMode === 'recent' && styles.sortBtnActive, pressed && { opacity: 0.85 }]}
                onPress={() => setFeedSortMode('recent')}
              >
                <Text style={styles.sortBtnText}>Recientes</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isLoggedIn && Boolean(reactionPickerPostId)}
        transparent
        animationType="fade"
        onRequestClose={() => setReactionPickerPostId(null)}
      >
        <View style={styles.overlaySheet}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setReactionPickerPostId(null)} />
          <View style={styles.reactionCard}>
            <Text style={styles.filterTitle}>Reaccionar</Text>
            {REACTION_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                style={({ pressed }) => [styles.reactionItem, pressed && { opacity: 0.8 }]}
                onPress={() => reactionPickerPostId && setReaction(reactionPickerPostId, opt.key)}
              >
                <Ionicons name={opt.icon as any} size={18} color={ACCENT} />
                <Text style={styles.reactionItemText}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>

      <Modal
        visible={isLoggedIn && composerOpen}
        animationType="slide"
        transparent
        onRequestClose={cerrarComposer}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            style={styles.modalKeyboardWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 18 : 0}
          >
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalKicker}>Comunidad</Text>
                <Text style={styles.modalTitle}>
                  {editingId ? 'Editar publicación' : 'Nueva publicación'}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.modalCloseBtn, pressed && { opacity: 0.75 }]}
                onPress={cerrarComposer}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            <ScrollView
              ref={composerScrollRef}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalScrollContent}
            >
              <View style={styles.modalSectionCard}>
                <Text style={styles.stepLabel}>Ubicación de la publicación</Text>
                <TextInput
                  style={styles.input}
                  value={content}
                  onChangeText={setContent}
                  placeholder="Ubicación detectada automáticamente"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  multiline
                  editable={false}
                />
                {locationStatus === 'loading' ? (
                  <View style={styles.locationHintRow}>
                    <Animated.View
                      style={[
                        styles.locationPulse,
                        {
                          transform: [
                            {
                              scale: locatePulse.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.8, 1.15],
                              }),
                            },
                          ],
                          opacity: locatePulse.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.4, 1],
                          }),
                        },
                      ]}
                    />
                    <Text style={styles.locationHint}>Localizando</Text>
                    <Animated.Text
                      style={[
                        styles.locationHint,
                        {
                          opacity: dotsCycle.interpolate({
                            inputRange: [0, 1, 2, 3],
                            outputRange: [0.3, 1, 1, 0.3],
                          }),
                        },
                      ]}
                    >
                      ...
                    </Animated.Text>
                  </View>
                ) : locationStatus === 'error' ? (
                  <Text style={styles.locationHintError}>{locationMessage}</Text>
                ) : null}
              </View>

              <View style={styles.modalSectionCard}>
                <Text style={styles.stepLabel}>Clasificación</Text>
                <View style={styles.severityRow}>
                  {SEVERITY_OPTIONS.map((item) => {
                    const meta = severityMeta[item];
                    const selected = severity === item;
                    return (
                      <Pressable
                        key={item}
                        onPress={() => setSeverity(item)}
                        style={({ pressed, hovered }) => [
                          styles.severityChip,
                          {
                            borderColor: meta.border,
                            backgroundColor: meta.bg,
                            shadowColor: meta.glow,
                          },
                          selected && styles.severityChipActive,
                          hovered && styles.severityChipHover,
                          pressed && styles.severityChipPressed,
                        ]}
                      >
                        <View style={styles.severityChipContent}>
                          <Text style={[styles.severityChipText, { color: meta.text }]}>
                            {meta.icon} {meta.label}
                          </Text>
                          {selected ? (
                            <View
                              style={[
                                styles.severitySelectedDot,
                                { backgroundColor: meta.text },
                              ]}
                            />
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.modalSectionCard}>
                <Text style={styles.stepLabel}>Foto</Text>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.previewImage} />
                ) : (
                  <View style={styles.emptyPreview}>
                    <Text style={styles.emptyPreviewText}>No hay imagen seleccionada</Text>
                  </View>
                )}
                <View style={styles.mediaBtnsRow}>
                  <Pressable style={[styles.cameraBtn, styles.mediaBtnHalf]} onPress={tomarFoto}>
                    <Text style={styles.actionBtnText}>Tomar foto</Text>
                  </Pressable>
                  <Pressable style={[styles.galleryBtn, styles.mediaBtnHalf]} onPress={seleccionarImagen}>
                    <Text style={styles.actionBtnText}>Galería</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.modalSectionCard}>
                <Text style={styles.stepLabel}>Pie de foto (opcional)</Text>
                <TextInput
                  style={[styles.input, styles.captionInput]}
                  value={draftComment}
                  onChangeText={setDraftComment}
                  onFocus={keepComposerInputVisible}
                  placeholder="Escribe el pie de foto"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  multiline
                  textAlignVertical="top"
                />
              </View>

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
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={Boolean(lightboxUri)}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxUri(null)}
      >
        <View style={styles.lightboxBackdrop}>
          {lightboxUri ? (
            <ZoomableLightboxImage
              uri={lightboxUri}
              onRequestClose={() => setLightboxUri(null)}
            />
          ) : null}
          <Pressable
            style={styles.lightboxCloseBtn}
            onPress={() => setLightboxUri(null)}
            hitSlop={12}
          >
            <Ionicons name="close" size={26} color="#f8fafc" />
          </Pressable>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const AnimatedImage = Reanimated.createAnimatedComponent(Image);

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.4;

/**
 * Imagen del lightbox con pinch-to-zoom, doble-tap para acercar/alejar y arrastre cuando está zoomed.
 * Tap simple cierra el lightbox.
 */
function ZoomableLightboxImage({
  uri,
  onRequestClose,
}: {
  uri: string;
  onRequestClose: () => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  const resetZoom = () => {
    'worklet';
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  const pinchGesture = Gesture.Pinch()
    .onStart((e) => {
      focalX.value = e.focalX;
      focalY.value = e.focalY;
    })
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.max(MIN_SCALE * 0.85, Math.min(next, MAX_SCALE));
    })
    .onEnd(() => {
      if (scale.value < MIN_SCALE) {
        resetZoom();
      } else {
        savedScale.value = scale.value;
      }
    });

  const panGesture = Gesture.Pan()
    .averageTouches(true)
    .minPointers(1)
    .onUpdate((e) => {
      if (scale.value <= 1.02) return;
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.05) {
        resetZoom();
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
      }
    });

  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (scale.value > 1.05) {
        resetZoom();
      } else {
        runOnJS(onRequestClose)();
      }
    });

  const composed = Gesture.Exclusive(
    Gesture.Simultaneous(pinchGesture, panGesture),
    doubleTapGesture,
    singleTapGesture,
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Reanimated.View style={styles.lightboxImageWrap}>
        <AnimatedImage
          source={{ uri }}
          style={[styles.lightboxImage, animatedStyle]}
          resizeMode="contain"
        />
      </Reanimated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SURFACE_DEEP,
    overflow: 'hidden',
  },
  bgGlowTop: {
    position: 'absolute',
    top: -100,
    left: -100,
    width: 340,
    height: 340,
    borderRadius: 999,
    backgroundColor: 'rgba(2,87,129,0.24)',
    zIndex: 0,
    pointerEvents: 'none',
  },
  bgGlowBottom: {
    position: 'absolute',
    bottom: -80,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 999,
    backgroundColor: 'rgba(56,189,248,0.08)',
    zIndex: 0,
    pointerEvents: 'none',
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 0,
  },
  /** Invitado: columna a pantalla completa sin ScrollView (sin deslizar). */
  guestRoot: {
    flex: 1,
    minHeight: 0,
  },
  guestInner: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'column',
    paddingHorizontal: 20,
  },
  titleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 18,
  },
  headerNewBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  titleIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleTextCol: { flex: 1, gap: 4, minWidth: 0 },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.15,
    color: 'rgba(148,163,184,0.95)',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f8fafc',
    letterSpacing: -0.35,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(148,163,184,0.92)',
    lineHeight: 19,
    marginTop: 2,
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
    backgroundColor: 'rgba(56,189,248,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.45)',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  galleryBtn: {
    backgroundColor: 'rgba(30,41,59,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#e2e8f0',
    fontWeight: '700',
    fontSize: 13,
  },
  severityRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  severityChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: 'center',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  severityChipActive: {
    transform: [{ scale: 1.02 }],
    borderWidth: 2,
    shadowOpacity: 0.9,
  },
  severityChipHover: {
    transform: [{ translateY: -1 }],
    shadowOpacity: 0.6,
  },
  severityChipPressed: {
    transform: [{ scale: 0.98 }],
    shadowOpacity: 0.75,
  },
  severityChipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  severitySelectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  severityChipText: {
    fontWeight: '700',
    fontSize: 12,
  },
  input: {
    minHeight: 96,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.24)',
    backgroundColor: 'rgba(2,6,18,0.48)',
    color: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 11,
    textAlignVertical: 'top',
  },
  crudActions: {
    flexDirection: 'row',
    gap: 10,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: ACCENT,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#082f49',
    fontWeight: '800',
    fontSize: 13,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: 'rgba(100,116,139,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
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
  feedSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  feedSectionTitle: {
    color: '#f1f5f9',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  feedSectionSub: {
    color: 'rgba(148,163,184,0.86)',
    fontSize: 11,
    marginTop: 2,
  },
  feedFilterBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.36)',
    backgroundColor: 'rgba(15,23,42,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedSkeletonWrap: {
    gap: 12,
  },
  feedSkeletonCard: {
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
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
    backgroundColor: 'rgba(15,23,42,0.78)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.16)',
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 6,
    overflow: 'hidden',
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  feedHeaderInfo: {
    flex: 1,
    minWidth: 0,
  },
  feedHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarShell: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  feedUser: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  feedUserMeta: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
  },
  feedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  feedBadgeIcon: {
    fontSize: 12,
  },
  feedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  postMenuBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postCaption: {
    color: '#e2e8f0',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    marginTop: 2,
    maxWidth: '100%',
    flexShrink: 1,
  },
  postLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
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
  socialBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
  },
  socialActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  socialActionText: {
    color: 'rgba(226,232,240,0.84)',
    fontSize: 13,
    fontWeight: '600',
  },
  postActions: {
    flexDirection: 'row',
    gap: 8,
  },
  smallBtn: {
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderColor: ACCENT,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
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
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.14)',
    backgroundColor: 'rgba(15,23,42,0.72)',
    padding: 16,
    gap: 10,
    overflow: 'hidden',
  },
  skeletonWrapGuest: {
    flex: 1,
    minHeight: 0,
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
  fabOuter: {
    position: 'absolute',
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(15,23,42,0.94)',
    borderWidth: 2,
    borderColor: 'rgba(56,189,248,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  fabOuterPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.96 }],
  },
  fabInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  fabMainIconOffset: {
    marginTop: 2,
  },
  fabBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(15,23,42,0.98)',
    borderWidth: 1.5,
    borderColor: 'rgba(56,189,248,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,8,20,0.72)',
    justifyContent: 'flex-end',
  },
  modalKeyboardWrap: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '88%',
    backgroundColor: 'rgba(8,14,30,0.98)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.26)',
    padding: 18,
    gap: 12,
    shadowColor: 'rgba(56,189,248,0.35)',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 22,
    elevation: 16,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.55)',
    marginTop: 2,
    marginBottom: 6,
  },
  modalTitleWrap: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  modalKicker: {
    color: 'rgba(125,211,252,0.95)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  overlaySheet: {
    flex: 1,
    backgroundColor: 'rgba(2,6,18,0.56)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  filterCard: {
    backgroundColor: 'rgba(12,18,34,0.96)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.28)',
    padding: 16,
    gap: 12,
  },
  filterTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  filterPillActive: {
    backgroundColor: 'rgba(56,189,248,0.2)',
  },
  filterPillText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
  },
  filterSortRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sortBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  sortBtnActive: {
    borderColor: 'rgba(56,189,248,0.5)',
    backgroundColor: 'rgba(56,189,248,0.16)',
  },
  sortBtnText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
  },
  reactionCard: {
    backgroundColor: 'rgba(12,18,34,0.96)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.28)',
    padding: 14,
    gap: 8,
  },
  reactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  reactionItemText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    color: '#f8fafc',
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.25,
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  modalScrollContent: {
    gap: 12,
    paddingBottom: 14,
  },
  modalSectionCard: {
    backgroundColor: 'rgba(15,23,42,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.24)',
    borderRadius: 16,
    padding: 13,
    gap: 9,
  },
  mediaBtnsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  mediaBtnHalf: {
    flex: 1,
  },
  captionInput: {
    minHeight: 96,
    maxHeight: 160,
  },
  locationHint: {
    color: 'rgba(144,205,253,0.9)',
    fontSize: 12,
    marginTop: -2,
  },
  locationHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: -2,
  },
  locationPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ACCENT,
  },
  locationHintError: {
    color: '#fca5a5',
    fontSize: 12,
    marginTop: -2,
  },
  commentsWrap: {
    marginTop: 6,
    gap: 8,
  },
  commentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 6,
  },
  commentsTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    minWidth: 0,
    maxWidth: '78%',
    paddingRight: 4,
  },
  commentsMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  commentsCount: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  commentsPanel: {
    gap: 8,
  },
  commentTreeNode: {
    gap: 6,
  },
  replyTreeNode: {
    position: 'relative',
  },
  replyTreeConnector: {
    position: 'absolute',
    left: -10,
    top: 0,
    bottom: 8,
    width: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.35)',
  },
  replyChildrenWrap: {
    gap: 6,
  },
  commentsEmpty: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 10,
  },
  commentRowOwner: {
    borderWidth: 1,
    borderColor: 'rgba(144,205,253,0.4)',
    backgroundColor: 'rgba(144,205,253,0.08)',
  },
  commentAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  commentAvatarFallback: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  replyRow: {
    marginTop: 8,
    marginLeft: 6,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 8,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(147,197,253,0.55)',
  },
  replyAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  replyAvatarFallback: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyBody: {
    flex: 1,
    gap: 3,
  },
  commentAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  commentAuthor: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  commentAuthorBadge: {
    backgroundColor: 'rgba(144,205,253,0.22)',
    borderColor: 'rgba(144,205,253,0.6)',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  commentAuthorBadgeText: {
    color: '#dbeafe',
    fontSize: 10,
    fontWeight: '700',
  },
  commentText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
    maxWidth: '100%',
    flexShrink: 1,
  },
  commentDate: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
  },
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  commentActionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  commentActionDanger: {
    backgroundColor: 'rgba(239,68,68,0.2)',
  },
  commentActionText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
  },
  commentTargetBanner: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(144,205,253,0.45)',
    backgroundColor: 'rgba(144,205,253,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  commentTargetText: {
    color: '#dbeafe',
    fontSize: 11,
    fontWeight: '600',
  },
  commentTargetCancel: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '700',
  },
  commentComposer: {
    gap: 8,
  },
  commentInput: {
    minHeight: 64,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    textAlignVertical: 'top',
  },
  mentionBox: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.22)',
    backgroundColor: 'rgba(15,23,42,0.9)',
    overflow: 'hidden',
  },
  mentionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  mentionItemPressed: {
    backgroundColor: 'rgba(56,189,248,0.1)',
  },
  mentionItemText: {
    color: '#bae6fd',
    fontSize: 13,
    fontWeight: '600',
  },
  commentMentionText: {
    color: '#7dd3fc',
    fontWeight: '700',
  },
  commentBtn: {
    alignSelf: 'flex-end',
    backgroundColor: '#2A7A4B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  commentBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },

  /* ── Lightbox ── */
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
  },
  lightboxImageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },
  lightboxCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 18,
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
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
