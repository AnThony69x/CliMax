import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccess } from '../../core/access/AccessContext';
import { getAccessToken, getSession, supabase } from '../../core/auth/supabaseClient';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Buffer } from 'buffer';
import {
  createCommunityComment,
  createCommunityPost,
  deleteCommunityComment,
  deleteCommunityPost,
  fetchAddress,
  fetchCommunityFeed,
  reportCommunityContent,
  updateCommunityComment,
  updateCommunityPost,
} from '../../core/api/weatherApi';
import { getToken } from '../../core/auth/authStorage';
import {
  applyLocationPrecision,
  useAccountPreferences,
} from '../../core/preferences/accountPreferences';
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
import { premiumColors, premiumShadow } from '../../theme/premium';

const SURFACE_DEEP = premiumColors.surface;
const ACCENT       = premiumColors.accent;

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
  moderation_status?: 'pending_review' | 'published' | 'hidden' | 'flagged' | 'removed' | 'rejected';
  moderation_reason?: string | null;
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
  moderation_status?: 'pending_review' | 'published' | 'hidden' | 'flagged' | 'removed' | 'rejected';
  moderation_reason?: string | null;
};
type CommentTarget = {
  postId: string;
  commentId: string;
  authorName: string;
};
type ReactionType = 'like' | 'apoya' | 'importante' | 'sorprende';
type CommunityNotification = {
  id: string;
  postId?: string;
  type: 'critical' | 'comment' | 'reaction';
  title: string;
  message: string;
  createdAt: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
};

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

const MODERATION_LABELS: Record<NonNullable<CommunityPost['moderation_status']>, string> = {
  pending_review: 'En revision',
  published: 'Publicado',
  flagged: 'Marcado',
  hidden: 'Oculto',
  removed: 'Removido',
  rejected: 'Rechazado',
};

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
  const accountPreferences = useAccountPreferences();
  const { hasEntitlement } = useAccess();
  const communityAllowed = hasEntitlement('community.basic');

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
  const [showOnlyMyPosts, setShowOnlyMyPosts] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [notificationTrayOpen, setNotificationTrayOpen] = useState(false);
  const [notificationSeenAt, setNotificationSeenAt] = useState(0);
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
  const planBlockedLayout = !guestLayout && !communityAllowed;

  const goToLogin = () => {
    router.push('/login?force=1');
  };

  const goToSubscriptions = () => {
    router.push('/(tabs)/subscriptions' as any);
  };

  const getCommunityToken = async () => {
    const sessionToken = await getAccessToken();
    if (sessionToken) return sessionToken;
    return getToken();
  };

  /** Al volver a esta pestaña, el scroll vuelve arriba (publicaciones más recientes primero). */
  useFocusEffect(
    useCallback(() => {
      void bootstrap();
      const tick = requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({ x: 0, y: 0, animated: false });
      });
      return () => cancelAnimationFrame(tick);
    }, [])
  );

  useEffect(() => {
    if (!isLoggedIn || !userId || !communityAllowed) return;

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
  }, [communityAllowed, isLoggedIn, userId]);

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

  const visiblePosts = useMemo(() => {
    const ownershipFiltered = showOnlyMyPosts && userId
      ? posts.filter((post) => post.user_id === userId)
      : [...posts];
    const filtered = activeSeverityFilter === 'todas'
      ? ownershipFiltered
      : ownershipFiltered.filter((post) => (post.severity ?? 'informacion') === activeSeverityFilter);

    return filtered.sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [posts, activeSeverityFilter, showOnlyMyPosts, userId]);

  const formatNotificationTime = (value: string) => {
    const diff = Date.now() - new Date(value).getTime();
    const minutes = Math.max(1, Math.floor(diff / 60000));
    if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Hace ${hours} h`;
    const days = Math.floor(hours / 24);
    return `Hace ${days} d`;
  };

  const communityNotifications = useMemo<CommunityNotification[]>(() => {
    const items: CommunityNotification[] = [];

    posts.forEach((post) => {
      const severity = post.severity ?? 'informacion';
      if (severity !== 'informacion') {
        items.push({
          id: `post-${post.id}-${severity}`,
          postId: post.id,
          type: 'critical',
          title: severity === 'grave' ? 'Reporte grave cercano' : 'Nueva alerta comunitaria',
          message: post.content || 'Una publicacion requiere atencion de la comunidad.',
          createdAt: post.created_at,
          icon: severity === 'grave' ? 'warning' : 'alert-circle-outline',
          accent: severity === 'grave' ? premiumColors.danger : premiumColors.warning,
        });
      }

      if (post.user_id === userId) {
        const reactionCount = reactionCountByPost[post.id] ?? 0;
        if (reactionCount > 0) {
          items.push({
            id: `reaction-${post.id}`,
            postId: post.id,
            type: 'reaction',
            title: 'Tu publicacion tiene actividad',
            message: `${reactionCount} ${reactionCount === 1 ? 'persona reacciono' : 'personas reaccionaron'} a tu reporte.`,
            createdAt: post.created_at,
            icon: 'heart-outline',
            accent: premiumColors.danger,
          });
        }
      }

      if (!accountPreferences.communityMentions) return;
      const comments = commentsByPost[post.id] ?? [];
      comments.forEach((comment) => {
        const isOwnComment = comment.user_id === userId;
        const isOnOwnPost = post.user_id === userId && !isOwnComment;
        const mentionsUser =
          !isOwnComment &&
          userId != null &&
          comment.content.toLowerCase().includes('@');

        if (!isOnOwnPost && !mentionsUser) return;
        items.push({
          id: `comment-${comment.id}`,
          postId: post.id,
          type: 'comment',
          title: isOnOwnPost ? 'Nuevo comentario en tu publicacion' : 'Te mencionaron en comunidad',
          message: comment.content,
          createdAt: comment.created_at,
          icon: isOnOwnPost ? 'chatbubble-ellipses-outline' : 'at-outline',
          accent: premiumColors.accent,
        });
      });
    });

    return items
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 24);
  }, [
    accountPreferences.communityMentions,
    commentsByPost,
    posts,
    reactionCountByPost,
    userId,
  ]);

  const unreadNotifications = communityNotifications.filter(
    (item) => new Date(item.createdAt).getTime() > notificationSeenAt
  ).length;

  const openNotificationTray = () => {
    setNotificationTrayOpen(true);
    setNotificationSeenAt(Date.now());
  };

  const openNotificationTarget = (item: CommunityNotification) => {
    setNotificationTrayOpen(false);
    if (item.postId) {
      setOpenCommentsByPost((prev) => ({ ...prev, [item.postId as string]: true }));
    }
  };

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

  const reportContent = async (targetType: 'post' | 'comment', targetId: string) => {
    try {
      const token = await getCommunityToken();
      if (!token) {
        NativeAlert.alert('Sesion', 'Inicia sesion nuevamente.');
        return;
      }
      await reportCommunityContent(
        {
          target_type: targetType,
          target_id: targetId,
          reason: 'usuario_reporta_contenido',
        },
        token
      );
      NativeAlert.alert('Reporte enviado', 'Admin y operadores revisaran este contenido.');
    } catch (error: any) {
      NativeAlert.alert('No se pudo reportar', error?.message ?? 'Intenta nuevamente.');
    }
  };

  const openPostMenu = (post: CommunityPost) => {
    if (post.user_id !== userId) {
      NativeAlert.alert('Opciones', 'Selecciona una accion', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Reportar', onPress: () => reportContent('post', post.id) },
      ]);
      return;
    }
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

  const getCommunityName = (id: string, fallback = 'Usuario') => {
    return profilesById[id]?.name ?? fallback;
  };
  const getCommunityAvatar = (id: string) => {
    return profilesById[id]?.avatar_url ?? null;
  };

  const bootstrap = async () => {
    try {
      const session = await getSession();
      const uid = (session?.user?.id as string | undefined) ?? null;
      setIsLoggedIn(Boolean(uid));
      setUserId(uid);
      if (uid) {
        await loadPosts(uid);
      } else {
        setPosts([]);
        setCommentsByPost({});
        setLikedByPost({});
        setReactionByPost({});
        setReactionCountByPost({});
      }
    } catch {
      setIsLoggedIn(false);
      setUserId(null);
      setPosts([]);
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

  const loadPosts = async (viewerId = userId) => {
    if (!communityAllowed) {
      setPosts([]);
      setCommentsByPost({});
      return;
    }

    const token = await getCommunityToken();
    if (!token) {
      setPosts([]);
      return;
    }

    const payload = await fetchCommunityFeed(token);
    setCommunityTableMissing(false);
    setCommentsTableMissing(false);
    const rows = payload.data?.posts ?? [];
    const normalized = rows.map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      content: row.content,
      created_at: row.created_at,
      image_url: typeof row.image_url === 'string' ? row.image_url : null,
      image_path: typeof row.image_path === 'string' ? row.image_path : null,
      severity: (row.severity as PostSeverity | null) ?? 'informacion',
      moderation_status: row.moderation_status ?? 'pending_review',
      moderation_reason: typeof row.moderation_reason === 'string' ? row.moderation_reason : null,
    })) as CommunityPost[];
    const comments = normalizeComments(payload.data?.comments ?? []);
    setCommentsByPost(groupCommentsByPost(comments));
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
    await loadProfilesForPosts(normalized, comments);
    await loadReactionsForPosts(normalized.map((post) => post.id), viewerId);
  };

  const loadReactionsForPosts = async (postIds: string[], viewerId = userId) => {
    if (!viewerId || postIds.length === 0) {
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
      if (row.user_id === viewerId) {
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

  const normalizeComments = (rows: any[]) => rows.map((row: any) => ({
    id: row.id,
    post_id: row.post_id,
    user_id: row.user_id,
    content: row.content,
    created_at: row.created_at,
    parent_comment_id: typeof row.parent_comment_id === 'string' ? row.parent_comment_id : null,
    moderation_status: row.moderation_status ?? 'pending_review',
    moderation_reason: typeof row.moderation_reason === 'string' ? row.moderation_reason : null,
  })) as CommunityComment[];

  const groupCommentsByPost = (comments: CommunityComment[]) => comments.reduce((acc: Record<string, CommunityComment[]>, comment) => {
    if (!acc[comment.post_id]) acc[comment.post_id] = [];
    acc[comment.post_id].push(comment);
    return acc;
  }, {});

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
      const safeCoords = applyLocationPrecision(
        coords.coords.latitude,
        coords.coords.longitude,
        accountPreferences.preciseLocation,
      );
      const data = await fetchAddress(safeCoords.latitude, safeCoords.longitude);
      const address = data?.display_name ?? null;
      const normalized = address
        ? address.split(',').slice(0, 3).join(',').trim()
        : accountPreferences.preciseLocation
          ? `${safeCoords.latitude.toFixed(4)}, ${safeCoords.longitude.toFixed(4)}`
          : `${safeCoords.latitude.toFixed(2)}, ${safeCoords.longitude.toFixed(2)} aprox.`;
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
        const token = await getCommunityToken();
        if (!token) throw new Error('Sesion no disponible.');
        if (!imageUrlToSave) throw new Error('La imagen es requerida.');
        await updateCommunityPost(
          editingId,
          {
            content: normalizedLocation,
            image_url: imageUrlToSave,
            image_path: imagePathToSave,
            severity,
            image_mime_type: imageMimeType,
          },
          token
        );
        console.log('[Community][savePost] Update DB OK', { id: editingId });
      } else {
        const token = await getCommunityToken();
        if (!token) throw new Error('Sesion no disponible.');
        if (!imageUrlToSave) throw new Error('La imagen es requerida.');
        await createCommunityPost(
          {
            content: normalizedLocation,
            image_url: imageUrlToSave,
            image_path: imagePathToSave,
            severity,
            image_mime_type: imageMimeType,
            initial_comment: draftComment.trim() || null,
          },
          token
        );
        console.log('[Community][savePost] Insert DB OK');
      }
      limpiarFormulario();
      setComposerOpen(false);
      await loadPosts();
      NativeAlert.alert('En revision', 'Tu contenido fue enviado y aparecera cuando admin u operador lo apruebe.');
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
      const token = await getCommunityToken();
      if (!token) throw new Error('Sesion no disponible.');
      if (isEditing) {
        await updateCommunityComment(postId, editingCommentTarget.commentId, { content: contentToSave }, token);
      } else if (replyTarget) {
        await createCommunityComment(postId, {
          content: contentToSave,
          parent_comment_id: replyTarget.commentId,
        }, token);
      } else {
        await createCommunityComment(postId, { content: contentToSave }, token);
      }
    } catch (caught: any) {
      error = { message: caught?.message ?? 'Intenta nuevamente.' };
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
    NativeAlert.alert('Comentario en revision', 'Tu comentario aparecera cuando sea aprobado.');
  };

  const startReplyToComment = (postId: string, comment: CommunityComment) => {
    const authorName = getCommunityName(comment.user_id);
    setReplyingCommentTarget({ postId, commentId: comment.id, authorName });
    setEditingCommentTarget(null);
    setOpenCommentsByPost((prev) => ({ ...prev, [postId]: true }));
  };

  const startEditComment = (postId: string, comment: CommunityComment) => {
    const authorName = getCommunityName(comment.user_id);
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
          try {
            const token = await getCommunityToken();
            if (!token) {
              NativeAlert.alert('Sesion', 'Inicia sesion nuevamente.');
              return;
            }
            await deleteCommunityComment(postId, commentId, token);

            if (editingCommentTarget?.commentId === commentId) {
              setEditingCommentTarget(null);
              setCommentDrafts((prev) => ({ ...prev, [postId]: '' }));
            }
            if (replyingCommentTarget?.commentId === commentId) {
              setReplyingCommentTarget(null);
            }
            await loadPosts();
          } catch (error: any) {
            NativeAlert.alert('No se pudo eliminar', error?.message ?? 'Intenta nuevamente.');
          }
        },
      },
    ]);
  };

  const severityMeta = useMemo(
    () => ({
      informacion: {
        label: 'Informacion',
        icon: 'information-circle' as const,
        bg: `${ACCENT}2e`,
        border: `${ACCENT}b2`,
        text: premiumColors.accentDeep,
        glow: `${ACCENT}59`,
      },
      alerta: {
        label: 'Alerta',
        icon: 'warning' as const,
        bg: `${premiumColors.warning}33`,
        border: `${premiumColors.warning}bf`,
        text: '#7a5211',
        glow: `${premiumColors.warning}59`,
      },
      grave: {
        label: 'Grave',
        icon: 'alert-circle' as const,
        bg: 'rgba(182,67,44,0.16)',
        border: 'rgba(182,67,44,0.6)',
        text: '#7a2318',
        glow: 'rgba(182,67,44,0.35)',
      },
    }),
    []
  );

  const deletePost = async (id: string) => {
    if (!userId) return;
    try {
      const token = await getCommunityToken();
      if (!token) throw new Error('Sesion no disponible.');
      await deleteCommunityPost(id, token);
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
        <View style={styles.headerActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir bandeja de notificaciones"
          style={({ pressed }) => [
            styles.headerNotifyBtn,
            pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
          ]}
          onPress={openNotificationTray}
        >
          <Ionicons name="notifications-outline" size={21} color={ACCENT} />
          {unreadNotifications > 0 ? (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </Text>
            </View>
          ) : null}
        </Pressable>
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
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 52}
    >
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={styles.bgGlowTop} />
      <View style={styles.bgGlowBottom} />

      {guestLayout || planBlockedLayout ? (
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
                <Text style={styles.overlayText}>
                  {guestLayout
                    ? 'Inicia sesion para utilizar esta seccion'
                    : 'Tu plan actual no incluye comunidad.'}
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.loginBtn, pressed && { opacity: 0.85 }]}
                  onPress={guestLayout ? goToLogin : goToSubscriptions}
                >
                  <Text style={styles.loginBtnText}>{guestLayout ? 'Ir a login' : 'Ver planes'}</Text>
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
                  {showOnlyMyPosts
                    ? 'Mostrando solo tus publicaciones'
                    : 'Ordenadas por fecha reciente'}
                </Text>
              </View>
              <View style={styles.feedActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.myPostsBtn,
                    showOnlyMyPosts && styles.myPostsBtnActive,
                    pressed && { opacity: 0.82 },
                  ]}
                  onPress={() => setShowOnlyMyPosts((prev) => !prev)}
                >
                  <Ionicons
                    name={showOnlyMyPosts ? 'person' : 'person-outline'}
                    size={16}
                    color={showOnlyMyPosts ? '#0c1222' : ACCENT}
                  />
                  <Text style={[styles.myPostsBtnText, showOnlyMyPosts && styles.myPostsBtnTextActive]}>
                    Mis
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.feedFilterBtn, pressed && { opacity: 0.82 }]}
                  onPress={() => setFilterModalOpen(true)}
                >
                  <Ionicons name="filter-outline" size={18} color={ACCENT} />
                </Pressable>
              </View>
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
                <Text style={styles.emptyPostsText}>
                  {showOnlyMyPosts ? 'Aun no tienes publicaciones.' : 'Aun no hay publicaciones.'}
                </Text>
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
                        {getCommunityAvatar(comment.user_id) ? (
                          <Image
                            source={{ uri: getCommunityAvatar(comment.user_id) as string }}
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
                              {getCommunityName(comment.user_id)}
                            </Text>
                            {isOwnerComment ? (
                              <View style={styles.commentAuthorBadge}>
                                <Text style={styles.commentAuthorBadgeText}>Autor</Text>
                              </View>
                            ) : null}
                          </View>
                          {renderCommentWithMentions(comment.content)}
                          {comment.moderation_status && comment.moderation_status !== 'published' ? (
                            <>
                              <View style={styles.commentModerationBadge}>
                                <Text style={styles.commentModerationBadgeText}>
                                  {MODERATION_LABELS[comment.moderation_status]}
                                </Text>
                              </View>
                              {comment.moderation_reason ? (
                                <Text style={styles.moderationReasonText}>{comment.moderation_reason}</Text>
                              ) : null}
                            </>
                          ) : null}
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
                            ) : (
                              <Pressable
                                style={styles.commentActionBtn}
                                onPress={() => reportContent('comment', comment.id)}
                              >
                                <Text style={styles.commentActionText}>Reportar</Text>
                              </Pressable>
                            )}
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

                const authorName = getCommunityName(post.user_id, post.user_id === userId ? 'Tu' : 'Usuario');
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
                      {getCommunityAvatar(post.user_id) ? (
                        <Image
                          source={{ uri: getCommunityAvatar(post.user_id) as string }}
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
                        <Ionicons
                          name={severityMeta[post.severity ?? 'informacion'].icon}
                          size={12}
                          color={severityMeta[post.severity ?? 'informacion'].text}
                        />
                        <Text
                          style={[
                            styles.feedBadgeText,
                            { color: severityMeta[post.severity ?? 'informacion'].text },
                          ]}
                        >
                          {severityMeta[post.severity ?? 'informacion'].label}
                        </Text>
                      </View>
                      {post.moderation_status && post.moderation_status !== 'published' ? (
                        <>
                          <View style={styles.moderationBadge}>
                            <Ionicons name="time-outline" size={12} color="#fbbf24" />
                            <Text style={styles.moderationBadgeText}>
                              {MODERATION_LABELS[post.moderation_status]}
                            </Text>
                          </View>
                          {post.moderation_reason ? (
                            <Text style={styles.moderationReasonText}>{post.moderation_reason}</Text>
                          ) : null}
                        </>
                      ) : null}
                      <Pressable
                        style={({ pressed }) => [styles.postMenuBtn, pressed && { opacity: 0.8 }]}
                        onPress={() => openPostMenu(post)}
                      >
                        <Ionicons name="ellipsis-horizontal" size={18} color="rgba(27,32,39,0.92)" />
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
                        color={likedByPost[post.id] ? premiumColors.danger : 'rgba(27,32,39,0.8)'}
                      />
                      <Text style={styles.socialActionText}>{reactionCountByPost[post.id] ?? 0}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        setOpenCommentsByPost((prev) => ({ ...prev, [post.id]: !prev[post.id] }))
                      }
                      style={({ pressed }) => [styles.socialActionBtn, pressed && { opacity: 0.8 }]}
                    >
                      <Ionicons name="chatbubble-outline" size={18} color="rgba(27,32,39,0.88)" />
                      <Text style={styles.socialActionText}>{totalComments}</Text>
                    </Pressable>
                    {post.user_id !== userId ? (
                      <Pressable
                        onPress={() => reportContent('post', post.id)}
                        style={({ pressed }) => [styles.socialActionBtn, pressed && { opacity: 0.8 }]}
                      >
                        <Ionicons name="flag-outline" size={18} color="rgba(27,32,39,0.88)" />
                        <Text style={styles.socialActionText}>Reportar</Text>
                      </Pressable>
                    ) : null}
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
                          color="rgba(27,32,39,0.9)"
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
                              placeholderTextColor="rgba(27,32,39,0.45)"
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
        visible={isLoggedIn && notificationTrayOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNotificationTrayOpen(false)}
      >
        <View style={[styles.overlaySheet, styles.notificationOverlaySheet]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setNotificationTrayOpen(false)} />
          <View style={styles.notificationTrayCard}>
            <View style={styles.notificationTrayHandle} />
            <View style={styles.notificationTrayHeader}>
              <View>
                <Text style={styles.notificationTrayKicker}>Comunidad</Text>
                <Text style={styles.notificationTrayTitle}>Bandeja de notificaciones</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.notificationCloseBtn, pressed && { opacity: 0.75 }]}
                onPress={() => setNotificationTrayOpen(false)}
              >
                <Ionicons name="close" size={18} color="#1b2027" />
              </Pressable>
            </View>

            <View style={styles.notificationPrefsRow}>
              <View style={[styles.notificationPrefPill, accountPreferences.communityMentions && styles.notificationPrefPillActive]}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={13}
                  color={accountPreferences.communityMentions ? '#0c1222' : 'rgba(27,32,39,0.72)'}
                />
                <Text style={[styles.notificationPrefText, accountPreferences.communityMentions && styles.notificationPrefTextActive]}>
                  Comentarios
                </Text>
              </View>
            </View>

            {communityNotifications.length === 0 ? (
              <View style={styles.notificationEmptyState}>
                <View style={styles.notificationEmptyIcon}>
                  <Ionicons name="notifications-off-outline" size={26} color={ACCENT} />
                </View>
                <Text style={styles.notificationEmptyTitle}>Todo tranquilo por ahora</Text>
                <Text style={styles.notificationEmptyText}>
                  Cuando haya alertas, comentarios o actividad en tus publicaciones, apareceran aqui.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.notificationList}
                contentContainerStyle={styles.notificationListContent}
                showsVerticalScrollIndicator={false}
              >
                {communityNotifications.map((item) => (
                  <Pressable
                    key={item.id}
                    style={({ pressed }) => [styles.notificationItem, pressed && { opacity: 0.86 }]}
                    onPress={() => openNotificationTarget(item)}
                  >
                    <View style={[styles.notificationItemIcon, { borderColor: item.accent }]}>
                      <Ionicons name={item.icon as any} size={18} color={item.accent} />
                    </View>
                    <View style={styles.notificationItemBody}>
                      <View style={styles.notificationItemTop}>
                        <Text style={styles.notificationItemTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.notificationItemTime}>
                          {formatNotificationTime(item.createdAt)}
                        </Text>
                      </View>
                      <Text style={styles.notificationItemMessage} numberOfLines={2}>
                        {item.message}
                      </Text>
                    </View>
                    {item.postId ? (
                      <Ionicons name="chevron-forward" size={16} color="rgba(148,163,184,0.8)" />
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

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
            <Pressable
              style={({ pressed }) => [
                styles.mineFilterRow,
                showOnlyMyPosts && styles.mineFilterRowActive,
                pressed && { opacity: 0.86 },
              ]}
              onPress={() => setShowOnlyMyPosts((prev) => !prev)}
            >
              <View style={styles.mineFilterIcon}>
                <Ionicons
                  name={showOnlyMyPosts ? 'checkmark-circle' : 'person-circle-outline'}
                  size={20}
                  color={showOnlyMyPosts ? '#0c1222' : ACCENT}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.mineFilterTitle, showOnlyMyPosts && styles.mineFilterTitleActive]}>
                  Mis publicaciones
                </Text>
                <Text style={[styles.mineFilterSub, showOnlyMyPosts && styles.mineFilterSubActive]}>
                  Ver solo lo que publicaste tu
                </Text>
              </View>
            </Pressable>
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
                <Ionicons name="close" size={20} color={premiumColors.ink} />
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
                  placeholderTextColor="rgba(27,32,39,0.45)"
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
                          <Ionicons name={meta.icon} size={13} color={meta.text} />
                          <Text style={[styles.severityChipText, { color: meta.text }]}>
                            {meta.label}
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
                  placeholderTextColor="rgba(27,32,39,0.45)"
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
    backgroundColor: premiumColors.auroraAqua,
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
    backgroundColor: premiumColors.auroraTeal,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerNotifyBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(226,98,43,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: premiumColors.danger,
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: '#fff1f2',
    fontSize: 9,
    fontWeight: '900',
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
    backgroundColor: `${ACCENT}1f`,
    borderWidth: 1,
    borderColor: `${ACCENT}47`,
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
    color: premiumColors.ink,
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
    borderColor: 'rgba(27,32,39,0.14)',
    backgroundColor: 'rgba(255,255,255,0.95)',
    padding: 14,
    gap: 8,
  },
  crudTitle: {
    color: premiumColors.ink,
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  crudSubtitle: {
    color: 'rgba(27,32,39,0.68)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: -4,
    marginBottom: 8,
  },
  stepLabel: {
    color: '#c94f1f',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  label: {
    color: premiumColors.ink,
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
    borderColor: 'rgba(27,32,39,0.3)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    backgroundColor: 'rgba(27,32,39,0.04)',
  },
  emptyPreviewText: {
    color: 'rgba(27,32,39,0.58)',
  },
  cameraBtn: {
    backgroundColor: `${ACCENT}33`,
    borderWidth: 1,
    borderColor: `${ACCENT}73`,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  galleryBtn: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionBtnText: {
    color: premiumColors.inkMuted,
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
    borderColor: `${ACCENT}3d`,
    backgroundColor: 'rgba(27,32,39,0.05)',
    color: premiumColors.ink,
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
    borderColor: 'rgba(27,32,39,0.22)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#7a2f10',
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
    color: premiumColors.ink,
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
  communityPrefsCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(226,98,43,0.2)',
    backgroundColor: 'rgba(255,255,255,0.78)',
    padding: 14,
    gap: 12,
    ...premiumShadow('medium'),
  },
  communityPrefsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  communityPrefsIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${ACCENT}1a`,
    borderWidth: 1,
    borderColor: 'rgba(226,98,43,0.22)',
    position: 'relative',
  },
  communityPrefsBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: premiumColors.danger,
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  communityPrefsBadgeText: {
    color: '#fff1f2',
    fontSize: 9,
    fontWeight: '900',
  },
  communityPrefsTitle: {
    color: premiumColors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  communityPrefsSub: {
    color: 'rgba(148,163,184,0.82)',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  communityPrefsChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  communityPrefsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(27,32,39,0.12)',
    backgroundColor: 'rgba(27,32,39,0.04)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  communityPrefsChipActive: {
    backgroundColor: ACCENT,
    borderColor: 'rgba(27,32,39,0.34)',
  },
  communityPrefsChipText: {
    color: 'rgba(27,32,39,0.78)',
    fontSize: 11,
    fontWeight: '800',
  },
  communityPrefsChipTextActive: {
    color: '#0c1222',
  },
  feedSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  feedSectionTitle: {
    color: premiumColors.ink,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  feedSectionSub: {
    color: 'rgba(148,163,184,0.86)',
    fontSize: 11,
    marginTop: 2,
  },
  feedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  myPostsBtn: {
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: `${ACCENT}5c`,
    backgroundColor: 'rgba(255,255,255,0.72)',
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  myPostsBtnActive: {
    backgroundColor: ACCENT,
    borderColor: 'rgba(27,32,39,0.38)',
  },
  myPostsBtnText: {
    color: ACCENT,
    fontSize: 12,
    fontWeight: '800',
  },
  myPostsBtnTextActive: {
    color: '#0c1222',
  },
  feedFilterBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: `${ACCENT}5c`,
    backgroundColor: 'rgba(255,255,255,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedSkeletonWrap: {
    gap: 12,
  },
  feedSkeletonCard: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(27,32,39,0.1)',
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
    backgroundColor: 'rgba(27,32,39,0.2)',
  },
  feedSkeletonHeadLines: {
    flex: 1,
    gap: 6,
  },
  feedSkeletonImage: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    backgroundColor: 'rgba(27,32,39,0.1)',
  },
  feedSkeletonLineLg: {
    width: '62%',
    height: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(27,32,39,0.22)',
  },
  feedSkeletonLineMd: {
    width: '84%',
    height: 7,
    borderRadius: 99,
    backgroundColor: 'rgba(27,32,39,0.16)',
  },
  feedSkeletonLineSm: {
    width: '38%',
    height: 7,
    borderRadius: 99,
    backgroundColor: 'rgba(27,32,39,0.14)',
  },
  feedSkeletonLineXs: {
    width: '55%',
    height: 7,
    borderRadius: 99,
    backgroundColor: 'rgba(27,32,39,0.12)',
  },
  emptyPostsText: {
    color: 'rgba(27,32,39,0.58)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 2,
  },
  postCard: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(226,98,43,0.18)',
    padding: 16,
    gap: 10,
    ...premiumShadow('medium'),
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
    color: premiumColors.ink,
    fontWeight: '700',
    fontSize: 13,
  },
  feedUserMeta: {
    color: 'rgba(27,32,39,0.6)',
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
  feedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  moderationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: `${premiumColors.warning}24`,
    borderWidth: 1,
    borderColor: `${premiumColors.warning}73`,
  },
  moderationBadgeText: {
    color: '#8a651e',
    fontSize: 10,
    fontWeight: '800',
  },
  moderationReasonText: {
    color: '#8a651e',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  postMenuBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(27,32,39,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(27,32,39,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postCaption: {
    color: premiumColors.inkMuted,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    marginTop: 2,
    maxWidth: '100%',
    flexShrink: 1,
  },
  postLabel: {
    color: 'rgba(27,32,39,0.6)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  postText: {
    color: premiumColors.ink,
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
    color: 'rgba(27,32,39,0.48)',
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
    color: 'rgba(27,32,39,0.84)',
    fontSize: 13,
    fontWeight: '600',
  },
  postActions: {
    flexDirection: 'row',
    gap: 8,
  },
  smallBtn: {
    backgroundColor: `${ACCENT}1f`,
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
    color: premiumColors.ink,
    fontWeight: '700',
    fontSize: 12,
  },
  skeletonWrap: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: `${ACCENT}24`,
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
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 2,
    borderColor: `${ACCENT}80`,
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
    borderColor: 'rgba(27,32,39,0.28)',
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
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1.5,
    borderColor: `${ACCENT}a6`,
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
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: `${ACCENT}42`,
    padding: 18,
    gap: 12,
    shadowColor: `${ACCENT}59`,
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
    color: 'rgba(226,98,43,0.95)',
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
  notificationOverlaySheet: {
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingBottom: 18,
  },
  filterCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: `${ACCENT}47`,
    padding: 16,
    gap: 12,
  },
  filterTitle: {
    color: premiumColors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  notificationTrayCard: {
    maxHeight: '78%',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(226,98,43,0.28)',
    padding: 16,
    gap: 14,
    ...premiumShadow('strong'),
  },
  notificationTrayHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.5)',
  },
  notificationTrayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  notificationTrayKicker: {
    color: 'rgba(226,98,43,0.95)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  notificationTrayTitle: {
    marginTop: 2,
    color: premiumColors.ink,
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  notificationCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(27,32,39,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(27,32,39,0.1)',
  },
  notificationPrefsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  notificationPrefPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(27,32,39,0.12)',
    backgroundColor: 'rgba(27,32,39,0.04)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  notificationPrefPillActive: {
    backgroundColor: ACCENT,
    borderColor: 'rgba(27,32,39,0.34)',
  },
  notificationPrefText: {
    color: 'rgba(27,32,39,0.78)',
    fontSize: 11,
    fontWeight: '900',
  },
  notificationPrefTextActive: {
    color: '#0c1222',
  },
  notificationEmptyState: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 18,
  },
  notificationEmptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${ACCENT}1a`,
    borderWidth: 1,
    borderColor: 'rgba(226,98,43,0.22)',
    marginBottom: 14,
  },
  notificationEmptyTitle: {
    color: premiumColors.ink,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  notificationEmptyText: {
    marginTop: 7,
    color: 'rgba(27,32,39,0.74)',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  notificationList: {
    maxHeight: 430,
  },
  notificationListContent: {
    gap: 10,
    paddingBottom: 4,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(27,32,39,0.1)',
    backgroundColor: 'rgba(27,32,39,0.055)',
    padding: 12,
  },
  notificationItemIcon: {
    width: 38,
    height: 38,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
  },
  notificationItemBody: {
    flex: 1,
    minWidth: 0,
  },
  notificationItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notificationItemTitle: {
    flex: 1,
    color: premiumColors.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  notificationItemTime: {
    color: 'rgba(148,163,184,0.82)',
    fontSize: 10,
    fontWeight: '700',
  },
  notificationItemMessage: {
    marginTop: 4,
    color: 'rgba(27,32,39,0.78)',
    fontSize: 12,
    lineHeight: 17,
  },
  mineFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${ACCENT}3d`,
    backgroundColor: 'rgba(27,32,39,0.045)',
    padding: 12,
  },
  mineFilterRowActive: {
    backgroundColor: ACCENT,
    borderColor: 'rgba(27,32,39,0.38)',
  },
  mineFilterIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${ACCENT}1f`,
  },
  mineFilterTitle: {
    color: premiumColors.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  mineFilterTitleActive: {
    color: '#0c1222',
  },
  mineFilterSub: {
    color: 'rgba(27,32,39,0.72)',
    fontSize: 11,
    marginTop: 2,
  },
  mineFilterSubActive: {
    color: 'rgba(255,255,255,0.72)',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: `${ACCENT}59`,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(27,32,39,0.04)',
  },
  filterPillActive: {
    backgroundColor: `${ACCENT}33`,
  },
  filterPillText: {
    color: premiumColors.inkMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  reactionCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${ACCENT}47`,
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
    color: premiumColors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    color: premiumColors.ink,
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
    backgroundColor: 'rgba(27,32,39,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(27,32,39,0.14)',
  },
  modalScrollContent: {
    gap: 12,
    paddingBottom: 14,
  },
  modalSectionCard: {
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: 1,
    borderColor: `${ACCENT}3d`,
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
    color: 'rgba(226,98,43,0.9)',
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
    color: premiumColors.ink,
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
    color: premiumColors.ink,
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(27,32,39,0.14)',
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
    color: 'rgba(27,32,39,0.5)',
    fontSize: 12,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(27,32,39,0.06)',
    borderRadius: 12,
    padding: 10,
  },
  commentRowOwner: {
    borderWidth: 1,
    borderColor: 'rgba(226,98,43,0.4)',
    backgroundColor: 'rgba(226,98,43,0.08)',
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
    backgroundColor: 'rgba(27,32,39,0.04)',
    borderRadius: 10,
    padding: 8,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(226,98,43,0.55)',
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
    color: premiumColors.ink,
    fontWeight: '700',
    fontSize: 12,
  },
  commentAuthorBadge: {
    backgroundColor: 'rgba(226,98,43,0.22)',
    borderColor: 'rgba(226,98,43,0.6)',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  commentAuthorBadgeText: {
    color: '#c94f1f',
    fontSize: 10,
    fontWeight: '700',
  },
  commentText: {
    color: premiumColors.ink,
    fontSize: 13,
    lineHeight: 18,
    maxWidth: '100%',
    flexShrink: 1,
  },
  commentModerationBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: `${premiumColors.warning}24`,
    borderWidth: 1,
    borderColor: `${premiumColors.warning}66`,
  },
  commentModerationBadgeText: {
    color: '#8a651e',
    fontSize: 10,
    fontWeight: '800',
  },
  commentDate: {
    color: 'rgba(27,32,39,0.45)',
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
    backgroundColor: 'rgba(27,32,39,0.1)',
  },
  commentActionDanger: {
    backgroundColor: 'rgba(239,68,68,0.2)',
  },
  commentActionText: {
    color: 'rgba(27,32,39,0.85)',
    fontSize: 11,
    fontWeight: '600',
  },
  commentTargetBanner: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(226,98,43,0.45)',
    backgroundColor: 'rgba(226,98,43,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  commentTargetText: {
    color: '#c94f1f',
    fontSize: 11,
    fontWeight: '600',
  },
  commentTargetCancel: {
    color: '#c94f1f',
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
    borderColor: 'rgba(27,32,39,0.2)',
    backgroundColor: 'rgba(27,32,39,0.06)',
    color: premiumColors.ink,
    paddingHorizontal: 12,
    paddingVertical: 8,
    textAlignVertical: 'top',
  },
  mentionBox: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${ACCENT}38`,
    backgroundColor: 'rgba(255,255,255,0.9)',
    overflow: 'hidden',
  },
  mentionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(27,32,39,0.08)',
  },
  mentionItemPressed: {
    backgroundColor: `${ACCENT}1a`,
  },
  mentionItemText: {
    color: '#c94f1f',
    fontSize: 13,
    fontWeight: '600',
  },
  commentMentionText: {
    color: '#c94f1f',
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
    color: premiumColors.ink,
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
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
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
