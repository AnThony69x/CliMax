import { Ionicons } from '@expo/vector-icons';
import * as ExpoLinking from 'expo-linking';
import * as Location from 'expo-location';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Platform, Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect } from 'react-native-svg';
import { useAccess } from '../../core/access/AccessContext';
import {
  API_BASE_URL,
  fetchAdminDashboard,
  fetchAdminPlans,
  fetchAdminUsers,
  fetchAuditLogs,
  fetchBillingPlans,
  fetchWeather,
  fetchOperatorPosts,
  fetchOperatorUsers,
  fetchWeatherHistory,
  fetchWeatherHistorySummary,
  createBillingCheckout,
  moderateCommunityComment,
  moderateCommunityPost,
  saveLocation,
  simulateBillingSuccess,
  syncBillingCheckout,
  updateAdminPlan,
  updateUserAccountStatus,
  updateUserRole,
  updateUserSubscription,
} from '../../core/api/weatherApi';
import type { AccountModerationStatus, ModerationStatus, WeatherHistoryLog, WeatherHistoryRange, WeatherHistorySummary } from '../../core/api/weatherApi';
import { getAccessToken } from '../../core/auth/supabaseClient';
import { useCities } from '../../core/cities/CitiesContext';
import { applyLocationPrecision, useAccountPreferences } from '../../core/preferences/accountPreferences';
import { premiumColors, premiumRadii, premiumShadow, premiumType } from '../../theme/premium';

type AdminUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  access?: {
    staff_role?: 'admin' | 'operator' | null;
    subscription_plan?: 'free' | 'premium' | 'professional';
    professional_sector?: string | null;
  };
  account_moderation?: {
    status?: AccountModerationStatus;
    reason?: string | null;
    suspended_until?: string | null;
    actioned_at?: string | null;
  };
};

type AuditLog = {
  id: number;
  actor_user_id?: string | null;
  target_user_id?: string | null;
  action: string;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
};

type AdminDashboard = {
  users?: {
    total?: number;
    recent_7d?: number;
  };
  roles?: {
    admin?: number;
    operator?: number;
    none?: number;
  };
  plans?: {
    free?: number;
    premium?: number;
    professional?: number;
  };
  community?: {
    total?: number;
    comments_total?: number;
    pending_review?: number;
    published?: number;
    flagged?: number;
    hidden?: number;
    removed?: number;
    rejected?: number;
    comments_pending_review?: number;
    comments_flagged?: number;
    reports_open?: number;
  };
  weather?: {
    logs_7d?: number;
    active_users_7d?: number;
    guest_logs_7d?: number;
  };
  alerts?: {
    total_7d?: number;
    unread?: number;
    high_risk_7d?: number;
  };
  audit?: {
    total?: number;
    recent?: AuditLog[];
  };
};

type CommunityPost = {
  id: string;
  user_id: string;
  content: string;
  image_url?: string | null;
  severity?: string;
  moderation_status?: string;
  moderation_reason?: string | null;
  created_at?: string;
};

type CommunityComment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  moderation_status?: string;
  moderation_reason?: string | null;
  created_at?: string;
};

type CommunityReport = {
  id: number;
  target_type: 'post' | 'comment';
  target_id: string;
  reason: string;
  details?: string | null;
  status: string;
  created_at?: string;
  target?: CommunityPost | CommunityComment | null;
};

const PROFESSIONAL_SECTOR = 'risk_management';
const RANGE_OPTIONS = ['30d', '90d', '180d', '365d'] as const satisfies readonly WeatherHistoryRange[];
const LOW_SAMPLE_WARNING_THRESHOLD = 5;
const ADMIN_SECTIONS = ['metricas', 'usuarios', 'planes', 'auditoria'] as const;
const OPERATOR_SECTIONS = ['comunidad', 'usuarios'] as const;
const COMMUNITY_FILTERS = ['publicaciones', 'comentarios'] as const;
const ROLE_FILTERS = ['todos', 'admin', 'operator', 'user'] as const;
const PLAN_FILTERS = ['todos', 'free', 'premium', 'professional'] as const;

type BillingPlan = {
  id?: number;
  key: 'free' | 'premium' | 'professional';
  name: string;
  description?: string | null;
  currency?: string;
  monthly_price_cents?: number;
  yearly_price_cents?: number;
  stripe_monthly_price_id?: string | null;
  stripe_yearly_price_id?: string | null;
  is_active?: boolean;
};

function AccessDenied({ title }: { title: string }) {
  return (
    <View style={styles.screen}>
      <PanelStatusBar />
      <View style={styles.centerCard}>
        <Ionicons name="lock-closed-outline" size={34} color={premiumColors.accent} />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.muted}>Tu cuenta no tiene permisos para ver esta seccion.</Text>
      </View>
    </View>
  );
}

function PanelStatusBar() {
  return <StatusBar barStyle="dark-content" backgroundColor={premiumColors.surface} />;
}

export function AdminPanelScreen() {
  const router = useRouter();
  const { isAdmin, refreshAccess } = useAccess();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [billingPlans, setBillingPlans] = useState<BillingPlan[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [section, setSection] = useState<(typeof ADMIN_SECTIONS)[number]>('usuarios');
  const [roleFilter, setRoleFilter] = useState<(typeof ROLE_FILTERS)[number]>('todos');
  const [planFilter, setPlanFilter] = useState<(typeof PLAN_FILTERS)[number]>('todos');
  const [expandedAdminUserId, setExpandedAdminUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const activeUsers = useMemo(() => users.filter((user) => !isDeletedUser(user)), [users]);
  const deletedUsers = useMemo(() => users.filter(isDeletedUser), [users]);
  const adminCount = dashboard?.roles?.admin ?? users.filter((user) => user.access?.staff_role === 'admin').length;
  const operatorCount = dashboard?.roles?.operator ?? users.filter((user) => user.access?.staff_role === 'operator').length;
  const professionalCount = dashboard?.plans?.professional ?? users.filter((user) => user.access?.subscription_plan === 'professional').length;
  const auditCount = dashboard?.audit?.total ?? auditLogs.length;
  const filteredUsers = useMemo(() => filterUsers(activeUsers, roleFilter, planFilter), [activeUsers, roleFilter, planFilter]);
  const filteredDeletedUsers = useMemo(() => filterUsers(deletedUsers, roleFilter, planFilter), [deletedUsers, roleFilter, planFilter]);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const [dashboardResult, usersResult, logsResult, plansResult] = await Promise.allSettled([
        fetchAdminDashboard(token),
        fetchAdminUsers(token),
        fetchAuditLogs(token),
        fetchAdminPlans(token),
      ]);

      if (dashboardResult.status === 'fulfilled') {
        setDashboard(dashboardResult.value.data ?? null);
      }

      if (usersResult.status === 'fulfilled') {
        setUsers(usersResult.value.data ?? []);
      } else {
        throw usersResult.reason;
      }

      if (logsResult.status === 'fulfilled') {
        setAuditLogs(logsResult.value.data ?? []);
      }
      if (plansResult.status === 'fulfilled') {
        setBillingPlans(plansResult.value.data ?? []);
      }
    } catch (error) {
      Alert.alert('Admin', error instanceof Error ? error.message : 'No se pudo cargar el panel.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeRole = async (userId: string, role: 'admin' | 'operator' | null) => {
    const token = await getAccessToken();
    if (!token) return;
    await updateUserRole(userId, role, token);
    await load();
  };

  const changePlan = async (userId: string, plan: 'free' | 'premium' | 'professional') => {
    const token = await getAccessToken();
    if (!token) return;
    await updateUserSubscription(
      userId,
      {
        plan,
        professional_sector: plan === 'professional' ? PROFESSIONAL_SECTOR : null,
      },
      token
    );
    await refreshAccess({ force: true });
    await load();
  };

  const applyAccountStatus = async (userId: string, status: AccountModerationStatus) => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const payload = await updateUserAccountStatus(userId, buildAccountStatusPayload(status), token);
      setUsers((current) => withUpdatedAccountModeration(current, userId, normalizeAccountModeration(status, payload?.data)));
      await load();
      Alert.alert('Cuenta actualizada', accountStatusSuccessText(status));
    } catch (error) {
      Alert.alert('No se pudo actualizar', error instanceof Error ? error.message : 'Intenta nuevamente en unos segundos.');
    }
  };

  const changeAccountStatus = (userId: string, status: AccountModerationStatus) => {
    Alert.alert(
      formatAccountStatus(status),
      accountStatusConfirmText(status),
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          style: status === 'active' ? 'default' : 'destructive',
          onPress: () => {
            void applyAccountStatus(userId, status);
          },
        },
      ],
    );
  };

  const saveBillingPlan = async (
    planKey: 'free' | 'premium' | 'professional',
    data: Partial<BillingPlan>
  ) => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      await updateAdminPlan(planKey, data, token);
      await load();
      Alert.alert('Plan actualizado', 'La configuracion del plan se guardo correctamente.');
    } catch (error) {
      console.warn('saveBillingPlan', error);
      Alert.alert(
        'No se pudo guardar',
        'Revisa que el backend este encendido, que el telefono este en la misma red y que tu usuario siga teniendo rol admin.'
      );
    }
  };

  if (!isAdmin) return <AccessDenied title="Panel Admin" />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={load}
          tintColor={premiumColors.accent}
          colors={[premiumColors.accent]}
        />
      }
    >
      <PanelStatusBar />
      <View style={styles.adminHero}>
        <View style={styles.heroGlowTop} />
        <View style={styles.heroHeader}>
          <View style={styles.heroIcon}>
            <Ionicons name="settings-outline" size={24} color={premiumColors.accentDeep} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Control interno</Text>
            <Text style={styles.heroTitle}>Panel Admin</Text>
          </View>
        </View>
        <Text style={styles.heroText}>Usuarios, roles, suscripciones y auditoria reciente en un solo lugar.</Text>
        <View style={styles.heroStats}>
          <View style={styles.heroStatMain}>
            <Text style={styles.heroStatValue}>{activeUsers.length}</Text>
            <Text style={styles.heroStatLabel}>Usuarios activos</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStatMain}>
            <Text style={styles.heroStatValue}>{auditCount}</Text>
            <Text style={styles.heroStatLabel}>Auditorias</Text>
          </View>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Funciones de administrador</Text>
          <Text style={styles.muted}>Accesos directos para controlar la app.</Text>
        </View>
        {loading ? <ActivityIndicator color={premiumColors.accent} /> : null}
      </View>
      <View style={styles.quickGrid}>
        <Pressable
          style={({ pressed }) => [styles.quickCard, section === 'usuarios' && styles.quickCardActive, pressed && { opacity: 0.86 }]}
          onPress={() => setSection('usuarios')}
        >
          <View style={styles.quickIcon}>
            <Ionicons name="people-outline" size={22} color={premiumColors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.quickTitle}>Configurar usuarios</Text>
            <Text style={styles.quickSub}>Cambiar rol y plan del usuario</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={premiumColors.inkMuted} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.quickCard, section === 'metricas' && styles.quickCardActive, pressed && { opacity: 0.86 }]}
          onPress={() => setSection('metricas')}
        >
          <View style={styles.quickIcon}>
            <Ionicons name="stats-chart-outline" size={22} color={premiumColors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.quickTitle}>Metricas</Text>
            <Text style={styles.quickSub}>Estado general de la app</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={premiumColors.inkMuted} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.quickCard, section === 'auditoria' && styles.quickCardActive, pressed && { opacity: 0.86 }]}
          onPress={() => setSection('auditoria')}
        >
          <View style={styles.quickIcon}>
            <Ionicons name="document-text-outline" size={22} color={premiumColors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.quickTitle}>Auditoria</Text>
            <Text style={styles.quickSub}>Cambios recientes</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={premiumColors.inkMuted} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.quickCard, pressed && { opacity: 0.86 }]}
          onPress={() => router.push('/(tabs)/operator' as any)}
        >
          <View style={styles.quickIcon}>
            <Ionicons name="shield-checkmark-outline" size={22} color={premiumColors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.quickTitle}>Moderacion</Text>
            <Text style={styles.quickSub}>Revisar comunidad</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={premiumColors.inkMuted} />
        </Pressable>
      </View>

      <View style={styles.summaryGrid}>
        <SummaryCard icon="shield-checkmark-outline" value={adminCount} label="Admins" tone="accent" />
        <SummaryCard icon="headset-outline" value={operatorCount} label="Operadores" tone="success" />
        <SummaryCard icon="briefcase-outline" value={professionalCount} label="Professional" tone="warning" />
      </View>

      <SectionTabs
        options={ADMIN_SECTIONS}
        value={section}
        labels={{ metricas: 'Metricas', usuarios: 'Usuarios', planes: 'Planes', auditoria: 'Auditoria' }}
        onChange={setSection}
      />

      {section === 'metricas' ? (
        <View style={styles.dashboardGrid}>
          <MetricTile label="Usuarios nuevos 7d" value={dashboard?.users?.recent_7d ?? 0} icon="person-add-outline" />
          <MetricTile label="Usuarios" value={dashboard?.roles?.none ?? 0} icon="person-outline" />
          <MetricTile label="Free" value={dashboard?.plans?.free ?? 0} icon="leaf-outline" />
          <MetricTile label="Premium" value={dashboard?.plans?.premium ?? 0} icon="star-outline" />
          <MetricTile label="Pendientes" value={dashboard?.community?.pending_review ?? 0} icon="time-outline" />
          <MetricTile label="Posts publicados" value={dashboard?.community?.published ?? 0} icon="chatbubbles-outline" />
          <MetricTile label="Posts marcados" value={dashboard?.community?.flagged ?? 0} icon="flag-outline" />
          <MetricTile label="Rechazados" value={dashboard?.community?.rejected ?? 0} icon="close-circle-outline" />
          <MetricTile label="Comentarios pendientes" value={dashboard?.community?.comments_pending_review ?? 0} icon="chatbox-ellipses-outline" />
          <MetricTile label="Reportes abiertos" value={dashboard?.community?.reports_open ?? 0} icon="megaphone-outline" />
          <MetricTile label="Clima 7d" value={dashboard?.weather?.logs_7d ?? 0} icon="partly-sunny-outline" />
          <MetricTile label="Alertas alto riesgo" value={dashboard?.alerts?.high_risk_7d ?? 0} icon="warning-outline" />
        </View>
      ) : null}

      {section === 'usuarios' ? (
        <>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Accesos de usuarios</Text>
              <Text style={styles.muted}>Gestiona permisos, plan del usuario y sector profesional.</Text>
            </View>
            {loading ? <ActivityIndicator color={premiumColors.accent} /> : null}
          </View>
          <View style={styles.infoBanner}>
            <Ionicons name="options-outline" size={18} color={premiumColors.accent} />
            <Text style={styles.infoBannerText}>
              Toca un usuario para desplegar sus opciones de rol, plan y control de cuenta.
            </Text>
          </View>
          <UserFilters
            roleFilter={roleFilter}
            planFilter={planFilter}
            onRoleChange={setRoleFilter}
            onPlanChange={setPlanFilter}
          />
          {!loading && filteredUsers.length === 0 ? <EmptyState icon="people-outline" title="Sin usuarios activos" text="Cambia los filtros o desliza hacia abajo para recargar." /> : null}
          {filteredUsers.map((user) => (
            <AdminUserCard
              key={user.id}
              user={user}
              expanded={expandedAdminUserId === user.id}
              onToggle={() => setExpandedAdminUserId((current) => (current === user.id ? null : user.id))}
              onChangeRole={changeRole}
              onChangePlan={changePlan}
              onChangeStatus={changeAccountStatus}
            />
          ))}
          {filteredDeletedUsers.length > 0 ? (
            <>
              <View style={styles.deletedListHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Usuarios eliminados</Text>
                  <Text style={styles.muted}>No aparecen en la lista principal. Puedes reactivarlos si fue un error.</Text>
                </View>
                <StatusChip label={`${filteredDeletedUsers.length}`} icon="trash-outline" />
              </View>
              {filteredDeletedUsers.map((user) => (
                <DeletedUserCard key={user.id} user={user} onChangeStatus={changeAccountStatus} />
              ))}
            </>
          ) : null}
        </>
      ) : null}

      {section === 'planes' ? (
        <>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Costos y Stripe</Text>
              <Text style={styles.muted}>Gestiona precios simulados y price IDs de Stripe test.</Text>
            </View>
            {loading ? <ActivityIndicator color={premiumColors.accent} /> : null}
          </View>
          {billingPlans.map((item) => (
            <PlanAdminCard key={item.key} plan={item} onSave={saveBillingPlan} />
          ))}
        </>
      ) : null}

      {section === 'auditoria' ? (
        <>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Auditoria reciente</Text>
              <Text style={styles.muted}>{auditCount} acciones registradas.</Text>
            </View>
            {loading ? <ActivityIndicator color={premiumColors.accent} /> : null}
          </View>
          {!loading && auditLogs.length === 0 ? <EmptyState icon="document-text-outline" title="Sin auditoria" text="Las acciones de roles, planes y moderacion apareceran aqui." /> : null}
          {auditLogs.slice(0, 50).map((log) => (
            <AuditLogCard key={log.id} log={log} />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

export function OperatorPanelScreen() {
  const { isAdmin, isOperator } = useAccess();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [section, setSection] = useState<(typeof OPERATOR_SECTIONS)[number]>('comunidad');
  const [communityFilter, setCommunityFilter] = useState<(typeof COMMUNITY_FILTERS)[number]>('publicaciones');
  const [roleFilter, setRoleFilter] = useState<(typeof ROLE_FILTERS)[number]>('todos');
  const [planFilter, setPlanFilter] = useState<(typeof PLAN_FILTERS)[number]>('todos');
  const [loading, setLoading] = useState(true);
  const activeUsers = useMemo(() => users.filter((user) => !isDeletedUser(user)), [users]);
  const deletedUsers = useMemo(() => users.filter(isDeletedUser), [users]);
  const filteredUsers = useMemo(() => filterUsers(activeUsers, roleFilter, planFilter), [activeUsers, roleFilter, planFilter]);
  const filteredDeletedUsers = useMemo(() => filterUsers(deletedUsers, roleFilter, planFilter), [deletedUsers, roleFilter, planFilter]);
  const reportedPostIds = useMemo(
    () => new Set(reports.filter((report) => report.target_type === 'post').map((report) => report.target_id)),
    [reports],
  );

  const load = useCallback(async () => {
    if (!isOperator) return;
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const [postsPayload, usersPayload] = await Promise.all([
        fetchOperatorPosts(token),
        fetchOperatorUsers(token),
      ]);
      setPosts(postsPayload.data?.posts ?? []);
      setComments(postsPayload.data?.comments ?? []);
      setReports(postsPayload.data?.reports ?? []);
      setUsers(usersPayload.data ?? []);
    } catch (error) {
      Alert.alert('Moderacion', error instanceof Error ? error.message : 'No se pudo cargar comunidad.');
    } finally {
      setLoading(false);
    }
  }, [isOperator]);

  useEffect(() => {
    void load();
  }, [load]);

  const moderate = async (postId: string, status: ModerationStatus) => {
    const token = await getAccessToken();
    if (!token) return;
    await moderateCommunityPost(postId, { moderation_status: status }, token);
    await load();
  };

  const moderateComment = async (commentId: string, status: ModerationStatus) => {
    const token = await getAccessToken();
    if (!token) return;
    await moderateCommunityComment(commentId, { moderation_status: status }, token);
    await load();
  };

  const applyAccountStatus = async (userId: string, status: AccountModerationStatus) => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const payload = await updateUserAccountStatus(userId, buildAccountStatusPayload(status), token);
      setUsers((current) => withUpdatedAccountModeration(current, userId, normalizeAccountModeration(status, payload?.data)));
      await load();
      Alert.alert('Cuenta actualizada', accountStatusSuccessText(status));
    } catch (error) {
      Alert.alert('No se pudo actualizar', error instanceof Error ? error.message : 'Intenta nuevamente en unos segundos.');
    }
  };

  const changeAccountStatus = (userId: string, status: AccountModerationStatus) => {
    Alert.alert(
      formatAccountStatus(status),
      accountStatusConfirmText(status),
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          style: status === 'active' ? 'default' : 'destructive',
          onPress: () => {
            void applyAccountStatus(userId, status);
          },
        },
      ],
    );
  };

  if (!isOperator) return <AccessDenied title="Moderar" />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={load}
          tintColor={premiumColors.accent}
          colors={[premiumColors.accent]}
        />
      }
    >
      <PanelStatusBar />
      <View style={styles.topFilterBlock}>
        <Text style={styles.actionGroupLabel}>Filtros</Text>
        <SectionTabs
          options={OPERATOR_SECTIONS}
          value={section}
          labels={{
            comunidad: 'Comunidad',
            usuarios: `Usuarios (${activeUsers.length})`,
          }}
          onChange={setSection}
        />
      </View>

      <View style={styles.adminHero}>
        <View style={styles.heroGlowTop} />
        <View style={styles.heroHeader}>
          <View style={styles.heroIcon}>
            <Ionicons name="shield-checkmark-outline" size={24} color={premiumColors.accentDeep} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Operacion</Text>
            <Text style={styles.heroTitle}>{isAdmin ? 'Moderar' : 'Panel Moderador'}</Text>
          </View>
        </View>
        <Text style={styles.heroText}>Revisa reportes, aprueba publicaciones y modera comentarios de la comunidad.</Text>
        <View style={styles.heroStats}>
          <View style={styles.heroStatMain}>
            <Text style={styles.heroStatValue}>{reports.length}</Text>
            <Text style={styles.heroStatLabel}>Reportes</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStatMain}>
            <Text style={styles.heroStatValue}>{activeUsers.length}</Text>
            <Text style={styles.heroStatLabel}>Usuarios activos</Text>
          </View>
        </View>
      </View>

      {reports.length > 0 ? (
        <Pressable
          style={({ pressed }) => [styles.reportBanner, pressed && { opacity: 0.86 }]}
          onPress={() => {
            setSection('comunidad');
            setCommunityFilter('publicaciones');
          }}
        >
          <Ionicons name="notifications-outline" size={19} color="#8a651e" />
          <Text style={styles.reportBannerText}>
            Hay {reports.length} reporte{reports.length === 1 ? '' : 's'} abierto{reports.length === 1 ? '' : 's'} por revisar.
          </Text>
        </Pressable>
      ) : null}

      {section === 'comunidad' ? (
        <>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Moderacion</Text>
              <Text style={styles.muted}>Aprueba, rechaza, oculta o remueve contenido reportado.</Text>
            </View>
            {loading ? <ActivityIndicator color={premiumColors.accent} /> : null}
          </View>
          <CommunityFilters
            value={communityFilter}
            onChange={setCommunityFilter}
            counts={{
              publicaciones: posts.length,
              comentarios: comments.length,
            }}
          />
          {communityFilter === 'publicaciones' ? (
            <>
              {!loading && posts.length === 0 ? <EmptyState icon="chatbubbles-outline" title="Sin publicaciones reportadas" text="Las publicaciones reportadas apareceran aqui." /> : null}
              {posts.map((post) => (
                <View key={post.id} style={[styles.card, reportedPostIds.has(post.id) && styles.reportedCard]}>
                  {post.image_url ? <Image source={{ uri: post.image_url }} style={styles.moderationImage} /> : null}
                  <View style={styles.userHeader}>
                    <View style={styles.avatar}>
                      <Ionicons name="chatbubble-ellipses-outline" size={20} color={premiumColors.accent} />
                    </View>
                    <View style={styles.userIdentity}>
                      <Text style={styles.cardTitle}>{post.severity ?? 'informacion'}</Text>
                      <Text style={styles.small}>{post.moderation_status ?? 'published'}</Text>
                    </View>
                    {reportedPostIds.has(post.id) ? <StatusChip label="Reportada" icon="megaphone-outline" /> : null}
                  </View>
                  <Text style={styles.muted}>{post.content}</Text>
                  {post.moderation_reason ? <Text style={styles.small}>{post.moderation_reason}</Text> : null}
                  {post.moderation_status ? <StatusChip label={formatStatus(post.moderation_status)} icon="shield-checkmark-outline" /> : null}
                  <View style={styles.rowWrap}>
                    <Action label="Pendiente" active={post.moderation_status === 'pending_review'} onPress={() => moderate(post.id, 'pending_review')} />
                    <Action label="Publicar" active={post.moderation_status === 'published'} onPress={() => moderate(post.id, 'published')} />
                    <Action label="Marcar" active={post.moderation_status === 'flagged'} onPress={() => moderate(post.id, 'flagged')} />
                    <Action label="Ocultar" active={post.moderation_status === 'hidden'} onPress={() => moderate(post.id, 'hidden')} />
                    <Action label="Rechazar" active={post.moderation_status === 'rejected'} onPress={() => moderate(post.id, 'rejected')} danger />
                    <Action label="Remover" active={post.moderation_status === 'removed'} onPress={() => moderate(post.id, 'removed')} danger />
                  </View>
                </View>
              ))}
            </>
          ) : null}
          {communityFilter === 'comentarios' ? (
            <>
              {!loading && comments.length === 0 ? <EmptyState icon="chatbox-ellipses-outline" title="Sin comentarios reportados" text="Los comentarios reportados apareceran aqui." /> : null}
              {comments.map((comment) => (
                <View key={comment.id} style={styles.card}>
                  <Text style={styles.cardTitle}>Comentario</Text>
                  <Text style={styles.muted}>{comment.content}</Text>
                  {comment.moderation_reason ? <Text style={styles.small}>{comment.moderation_reason}</Text> : null}
                  <View style={styles.rowWrap}>
                    <Action label="Pendiente" active={comment.moderation_status === 'pending_review'} onPress={() => moderateComment(comment.id, 'pending_review')} />
                    <Action label="Publicar" active={comment.moderation_status === 'published'} onPress={() => moderateComment(comment.id, 'published')} />
                    <Action label="Marcar" active={comment.moderation_status === 'flagged'} onPress={() => moderateComment(comment.id, 'flagged')} />
                    <Action label="Ocultar" active={comment.moderation_status === 'hidden'} onPress={() => moderateComment(comment.id, 'hidden')} />
                    <Action label="Rechazar" active={comment.moderation_status === 'rejected'} onPress={() => moderateComment(comment.id, 'rejected')} danger />
                    <Action label="Remover" active={comment.moderation_status === 'removed'} onPress={() => moderateComment(comment.id, 'removed')} danger />
                  </View>
                </View>
              ))}
            </>
          ) : null}
        </>
      ) : null}

      {section === 'usuarios' ? (
        <>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Usuarios</Text>
              <Text style={styles.muted}>Vista solo lectura para apoyo operativo.</Text>
            </View>
            {loading ? <ActivityIndicator color={premiumColors.accent} /> : null}
          </View>
          <UserFilters
            roleFilter={roleFilter}
            planFilter={planFilter}
            onRoleChange={setRoleFilter}
            onPlanChange={setPlanFilter}
          />
          {!loading && filteredUsers.length === 0 ? <EmptyState icon="people-outline" title="Sin usuarios activos" text="No hay usuarios disponibles con esos filtros." /> : null}
          {filteredUsers.map((user) => (
            <ReadOnlyUserCard key={user.id} user={user} onChangeStatus={changeAccountStatus} />
          ))}
          {filteredDeletedUsers.length > 0 ? (
            <>
              <View style={styles.deletedListHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Usuarios eliminados</Text>
                  <Text style={styles.muted}>Separados de la lista principal para no mezclarlos con cuentas moderables.</Text>
                </View>
                <StatusChip label={`${filteredDeletedUsers.length}`} icon="trash-outline" />
              </View>
              {filteredDeletedUsers.map((user) => (
                <DeletedUserCard key={user.id} user={user} onChangeStatus={changeAccountStatus} />
              ))}
            </>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

export function ProfessionalPanelScreen() {
  const { plan, professionalSector, hasEntitlement } = useAccess();
  const { savedCities } = useCities();
  const accountPreferences = useAccountPreferences();
  const [lat, setLat] = useState('-2.170998');
  const [lon, setLon] = useState('-79.922359');
  const [range, setRange] = useState<(typeof RANGE_OPTIONS)[number]>('365d');
  const [summary, setSummary] = useState<WeatherHistorySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationLabel, setLocationLabel] = useState('Selecciona una zona');
  const [hasSelectedLocation, setHasSelectedLocation] = useState(false);
  const [insightVisible, setInsightVisible] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<WeatherHistoryLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const summaryRequestIdRef = useRef(0);
  const locationChangeIdRef = useRef(0);
  const allowed = hasEntitlement('weather.history.extended');

  const loadSummaryForCoords = async (queryLat: number, queryLon: number) => {
    if (!Number.isFinite(queryLat) || !Number.isFinite(queryLon)) {
      Alert.alert('Historial climatico', 'Ingresa coordenadas validas para consultar.');
      return;
    }
    const requestId = summaryRequestIdRef.current + 1;
    summaryRequestIdRef.current = requestId;
    setLoading(true);
    setSummary(null);
    setHistoryLogs([]);
    setHistoryError(null);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const payload = await fetchWeatherHistorySummary(queryLat, queryLon, range, token);
      if (requestId !== summaryRequestIdRef.current) return;
      setSummary(payload.data);
    } catch (error) {
      if (requestId !== summaryRequestIdRef.current) return;
      Alert.alert('Historial climatico', error instanceof Error ? error.message : 'No se pudo cargar el historial.');
    } finally {
      if (requestId === summaryRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const handleUseCurrentLocation = async (options?: { autoLoad?: boolean }) => {
    const locationChangeId = locationChangeIdRef.current + 1;
    locationChangeIdRef.current = locationChangeId;
    setLocating(true);
    setSummary(null);
    setHistoryLogs([]);
    setHistoryError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Ubicacion', 'Permiso de ubicacion denegado.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const safeCoords = applyLocationPrecision(
        position.coords.latitude,
        position.coords.longitude,
        accountPreferences.preciseLocation
      );
      setLat(String(safeCoords.latitude));
      setLon(String(safeCoords.longitude));
      setLocationLabel('Mi ubicacion');
      setHasSelectedLocation(true);
      if (options?.autoLoad) {
        if (locationChangeId !== locationChangeIdRef.current) return;
        await loadSummaryForCoords(safeCoords.latitude, safeCoords.longitude);
      }
    } catch {
      Alert.alert('Ubicacion', 'No se pudo obtener la ubicacion actual.');
    } finally {
      setLocating(false);
    }
  };

  const loadSummary = async () => {
    await loadSummaryForCoords(Number(lat), Number(lon));
  };

  const persistCurrentWeatherSnapshot = async (queryLat: number, queryLon: number, address: string) => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const weatherPayload = await fetchWeather(queryLat, queryLon);
      const snapshot = extractCurrentWeatherSnapshot(weatherPayload);
      if (!snapshot) return;
      await saveLocation({
        latitude: queryLat,
        longitude: queryLon,
        address,
        temperature: snapshot.temperature,
        weather_code: snapshot.weatherCode,
        wind_speed: snapshot.windSpeed,
      }, token);
    } catch {
      // El snapshot solo alimenta la trazabilidad; el resumen puede consultarse igual.
    }
  };

  const handleSelectSavedCity = async (city: { name: string; lat: number; lon: number }) => {
    const locationChangeId = locationChangeIdRef.current + 1;
    locationChangeIdRef.current = locationChangeId;
    setLat(String(city.lat));
    setLon(String(city.lon));
    setLocationLabel(city.name);
    setHasSelectedLocation(true);
    setLoading(true);
    setSummary(null);
    setHistoryLogs([]);
    setHistoryError(null);
    await persistCurrentWeatherSnapshot(city.lat, city.lon, city.name);
    if (locationChangeId !== locationChangeIdRef.current) return;
    await loadSummaryForCoords(city.lat, city.lon);
  };

  const openInsight = async () => {
    if (!summary) return;
    setInsightVisible(true);
    setHistoryLogs([]);
    setHistoryError(null);
    setHistoryLoading(false);

    if ((summary.logs_count ?? 0) === 0) {
      return;
    }

    const queryLat = Number(lat);
    const queryLon = Number(lon);
    if (!Number.isFinite(queryLat) || !Number.isFinite(queryLon)) {
      setHistoryError('No se pudo cargar el detalle porque la zona no es valida.');
      return;
    }

    setHistoryLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setHistoryError('No se encontro una sesion activa para cargar el detalle.');
        return;
      }
      const payload = await fetchWeatherHistory(queryLat, queryLon, summary.range ?? range, token);
      setHistoryLogs(payload.data ?? []);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'No se pudo cargar el detalle.');
    } finally {
      setHistoryLoading(false);
    }
  };

  if (!allowed) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <PanelStatusBar />
        <Text style={styles.eyebrow}>Professional</Text>
        <Text style={styles.title}>Trazabilidad climatica</Text>
        <Text style={styles.muted}>
          Tu plan actual es {plan}. El historial extendido por sector se habilita con Professional.
        </Text>
        <SubscriptionPanelScreen compact />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <PanelStatusBar />
      <Text style={styles.eyebrow}>Professional</Text>
      <Text style={styles.title}>Trazabilidad climatica</Text>
      <Text style={styles.muted}>
        Sector: {professionalSector ?? 'general profesional'} | Analisis por zona y periodo.
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Zona de analisis</Text>
        <Text style={styles.muted}>{locationLabel}</Text>
        <View style={styles.rowWrap}>
          <Action
            label={locating ? 'Localizando...' : 'Mi ubicacion'}
            active={locationLabel === 'Mi ubicacion'}
            disabled={locating}
            onPress={() => handleUseCurrentLocation({ autoLoad: true })}
          />
          {savedCities.map((city) => (
            <Action
              key={city.id}
              label={city.name}
              active={locationLabel === city.name}
              onPress={() => handleSelectSavedCity(city)}
            />
          ))}
        </View>
        {savedCities.length === 0 ? (
          <Text style={styles.muted}>Agrega ciudades desde Buscar para consultarlas aqui.</Text>
        ) : null}
        <View style={styles.rowWrap}>
          {RANGE_OPTIONS.map((item) => (
            <Action key={item} label={item} active={range === item} onPress={() => setRange(item)} />
          ))}
        </View>
        <Action
          label={loading ? 'Cargando...' : 'Consultar con rango'}
          disabled={!hasSelectedLocation || loading}
          onPress={loadSummary}
        />
      </View>
      {loading && hasSelectedLocation ? (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.metricCard, styles.metricCardLoading]}
        >
          <ActivityIndicator color={premiumColors.accent} />
          <View style={styles.userIdentity}>
            <Text style={styles.metricLabel}>Actualizando trazabilidad</Text>
            <Text style={styles.metricSub}>Cargando datos de {locationLabel}...</Text>
          </View>
        </View>
      ) : summary ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ver analisis climatico"
          style={({ pressed }) => [styles.metricCard, pressed && { opacity: 0.88 }]}
          onPress={openInsight}
        >
          <Text style={styles.metricValue}>{summary.logs_count ?? 0}</Text>
          <Text style={styles.metricLabel}>Registros encontrados</Text>
          <Text style={styles.metricSub}>Temp. promedio: {formatNumber(summary.avg_temperature)} C</Text>
          <Text style={styles.metricSub}>Rango: {formatNumber(summary.min_temperature)} C a {formatNumber(summary.max_temperature)} C</Text>
          <Text style={styles.metricSub}>Eventos extremos: {summary.extreme_weather_events ?? 0}</Text>
          {isLowSampleCount(summary.logs_count) ? <LimitedSampleWarning count={summary.logs_count ?? 0} /> : null}
          <View style={styles.metricCta}>
            <Text style={styles.metricCtaText}>Ver analisis</Text>
            <Ionicons name="analytics-outline" size={16} color={premiumColors.accent} />
          </View>
        </Pressable>
      ) : null}
      <WeatherHistoryInsightModal
        visible={insightVisible}
        zoneLabel={locationLabel}
        range={summary?.range ?? range}
        summary={summary}
        logs={historyLogs}
        loading={historyLoading}
        error={historyError}
        onClose={() => setInsightVisible(false)}
      />
    </ScrollView>
  );
}

function WeatherHistoryInsightModal({
  visible,
  zoneLabel,
  range,
  summary,
  logs,
  loading,
  error,
  onClose,
}: {
  visible: boolean;
  zoneLabel: string;
  range: WeatherHistoryRange;
  summary: WeatherHistorySummary | null;
  logs: WeatherHistoryLog[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const insight = useMemo(() => buildWeatherInsight(zoneLabel, range, summary, logs), [logs, range, summary, zoneLabel]);
  const hasRecords = insight.count > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.insightModal} accessibilityViewIsModal>
          <View style={styles.insightHeader}>
            <View style={styles.userIdentity}>
              <Text style={styles.eyebrow}>Analisis climatico</Text>
              <Text style={styles.sectionTitle}>{zoneLabel}</Text>
              <Text style={styles.muted}>{range} | {insight.count} registros</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar analisis climatico"
              hitSlop={10}
              style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.72 }]}
              onPress={onClose}
            >
              <Ionicons name="close" size={20} color={premiumColors.ink} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.insightContent}>
            {loading ? (
              <View style={styles.loadingBlock}>
                <ActivityIndicator color={premiumColors.accent} />
                <Text style={styles.muted}>Cargando registros detallados...</Text>
              </View>
            ) : null}

            {error ? (
              <View style={styles.warningBlock}>
                <Ionicons name="alert-circle-outline" size={18} color={premiumColors.warning} />
                <Text style={styles.warningText}>No se pudo cargar el detalle. Se muestra el analisis agregado disponible.</Text>
              </View>
            ) : null}

            {!hasRecords ? (
              <EmptyState
                icon="cloud-offline-outline"
                title="Sin registros para esta zona"
                text="No encontramos datos dentro del rango seleccionado. Prueba con otro periodo o con una ciudad guardada cercana."
              />
            ) : (
              <>
                {isLowSampleCount(insight.count) ? <LimitedSampleWarning count={insight.count} /> : null}

                <View style={styles.storyCard}>
                  <Text style={styles.cardTitle}>Lectura rapida</Text>
                  {insight.story.map((item) => (
                    <Text key={item} style={styles.storyText}>{item}</Text>
                  ))}
                </View>

                <View style={styles.chartBlock}>
                  <View style={styles.chartHeader}>
                    <Text style={styles.cardTitle}>Temperatura por tiempo</Text>
                    <Text style={styles.small}>{insight.detailPoints.length > 1 ? 'Detalle historico' : 'Vista agregada'}</Text>
                  </View>
                  <TemperatureLineChart logs={insight.detailPoints} min={insight.minTemperature} max={insight.maxTemperature} />
                </View>

                <View style={styles.chartBlock}>
                  <Text style={styles.cardTitle}>Minimo, promedio y maximo</Text>
                  <TemperatureBars min={insight.minTemperature} avg={insight.avgTemperature} max={insight.maxTemperature} />
                </View>

                <View style={styles.insightGrid}>
                  <InsightStat label="Eventos extremos" value={`${insight.extremeEvents}`} helper={insight.extremeLabel} icon="thunderstorm-outline" />
                  <InsightStat label="Registros normales" value={`${Math.max(insight.count - insight.extremeEvents, 0)}`} helper="Sin senal extrema" icon="partly-sunny-outline" />
                  <InsightStat label="Viento promedio" value={`${formatNumber(insight.avgWindSpeed)} km/h`} helper="Promedio" icon="speedometer-outline" />
                  <InsightStat label="Viento maximo" value={`${formatNumber(insight.maxWindSpeed)} km/h`} helper="Maximo" icon="flag-outline" />
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function TemperatureLineChart({
  logs,
  min,
  max,
}: {
  logs: WeatherHistoryLog[];
  min: number | null;
  max: number | null;
}) {
  const points = logs
    .map((log) => ({
      temperature: finiteNumber(log.temperature),
      time: log.captured_at ? new Date(log.captured_at).getTime() : Number.NaN,
    }))
    .filter((point): point is { temperature: number; time: number } => Number.isFinite(point.temperature) && Number.isFinite(point.time));
  const width = 300;
  const height = 132;
  const padding = 18;
  const fallbackMin = min ?? (points.length ? Math.min(...points.map((point) => point.temperature)) : 0);
  const fallbackMax = max ?? (points.length ? Math.max(...points.map((point) => point.temperature)) : fallbackMin + 1);
  const tempSpan = Math.max(fallbackMax - fallbackMin, 1);
  const timeStart = points.length ? Math.min(...points.map((point) => point.time)) : 0;
  const timeEnd = points.length ? Math.max(...points.map((point) => point.time)) : 1;
  const timeSpan = Math.max(timeEnd - timeStart, 1);
  const svgPoints = points.map((point, index) => {
    const x = points.length === 1
      ? width / 2
      : padding + ((point.time - timeStart) / timeSpan) * (width - padding * 2);
    const y = height - padding - ((point.temperature - fallbackMin) / tempSpan) * (height - padding * 2);
    return { x, y, key: `${point.time}-${index}` };
  });

  if (svgPoints.length === 0) {
    return <Text style={styles.muted}>No hay suficientes puntos detallados para dibujar la tendencia.</Text>;
  }

  return (
    <View accessible accessibilityLabel={`Grafico de temperatura entre ${formatNumber(fallbackMin)} y ${formatNumber(fallbackMax)} grados Celsius`}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(27,32,39,0.18)" strokeWidth={1} />
        <Line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="rgba(27,32,39,0.18)" strokeWidth={1} />
        {svgPoints.length > 1 ? (
          <Polyline
            points={svgPoints.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke={premiumColors.accent}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {svgPoints.map((point) => (
          <Circle key={point.key} cx={point.x} cy={point.y} r={3.5} fill={premiumColors.accent} />
        ))}
      </Svg>
      <View style={styles.chartLegend}>
        <Text style={styles.small}>{formatNumber(fallbackMin)} C</Text>
        <Text style={styles.small}>{formatNumber(fallbackMax)} C</Text>
      </View>
    </View>
  );
}

function TemperatureBars({ min, avg, max }: { min: number | null; avg: number | null; max: number | null }) {
  const values = [
    { label: 'Min', value: min, color: premiumColors.accent },
    { label: 'Prom', value: avg, color: premiumColors.success },
    { label: 'Max', value: max, color: premiumColors.warning },
  ];
  const numericValues = values.map((item) => finiteNumber(item.value)).filter((value): value is number => Number.isFinite(value));
  const maxValue = numericValues.length ? Math.max(...numericValues.map((value) => Math.abs(value)), 1) : 1;
  const width = 300;
  const height = 86;
  const barWidth = 56;

  return (
    <View accessible accessibilityLabel="Grafico de barras de temperatura minima, promedio y maxima">
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {values.map((item, index) => {
          const value = finiteNumber(item.value) ?? 0;
          const barHeight = Math.max((Math.abs(value) / maxValue) * 52, value === 0 ? 4 : 8);
          const x = 32 + index * 92;
          return (
            <Rect
              key={item.label}
              x={x}
              y={height - barHeight - 18}
              width={barWidth}
              height={barHeight}
              rx={10}
              fill={withAlpha(item.color, 0.78)}
            />
          );
        })}
      </Svg>
      <View style={styles.barLabels}>
        {values.map((item) => (
          <View key={item.label} style={styles.barLabel}>
            <Text style={styles.metricSub}>{item.label}</Text>
            <Text style={styles.badgeText}>{formatNumber(item.value)} C</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function InsightStat({
  label,
  value,
  helper,
  icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.insightStat}>
      <Ionicons name={icon} size={17} color={premiumColors.accent} />
      <Text style={styles.metricTileValue}>{value}</Text>
      <Text style={styles.metricTileLabel}>{label}</Text>
      <Text style={styles.small}>{helper}</Text>
    </View>
  );
}

function LimitedSampleWarning({ count }: { count: number }) {
  return (
    <View
      accessibilityRole="text"
      style={styles.sampleWarningBlock}
    >
      <Ionicons name="information-circle-outline" size={18} color={premiumColors.warning} />
      <Text style={styles.sampleWarningText}>
        Muestra limitada: con {count} {count === 1 ? 'registro' : 'registros'}, el analisis puede ser inexacto hasta acumular mas mediciones.
      </Text>
    </View>
  );
}

export function SubscriptionPanelScreen({ compact = false }: { compact?: boolean }) {
  const { plan, refreshAccess } = useAccess();
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month');
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const payload = await fetchBillingPlans(token);
      setPlans(payload.data ?? []);
    } catch (error) {
      Alert.alert('Planes', error instanceof Error ? error.message : 'No se pudieron cargar los planes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const startCheckout = async (planKey: 'free' | 'premium' | 'professional') => {
    setCheckoutPlan(planKey);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const successUrl = ExpoLinking.createURL('subscriptions', {
        queryParams: { checkout: 'success' },
      });
      const cancelUrl = ExpoLinking.createURL('subscriptions', {
        queryParams: { checkout: 'cancel' },
      });
      const browserSuccessUrl = `${API_BASE_URL}/billing/return?status=success&app_url=${encodeURIComponent(successUrl)}`;
      const browserCancelUrl = `${API_BASE_URL}/billing/return?status=cancel&app_url=${encodeURIComponent(cancelUrl)}`;
      const payload = await createBillingCheckout({
        plan: planKey,
        billing_interval: billingInterval,
        success_url: browserSuccessUrl,
        cancel_url: browserCancelUrl,
      }, token);
      const data = payload.data;
      if (data?.checkout_url) {
        const result = await WebBrowser.openAuthSessionAsync(data.checkout_url, ExpoLinking.createURL('subscriptions'));
        if (result.type === 'success' && result.url.includes('checkout=success')) {
          const returnedSessionId = Number(readUrlParam(result.url, 'checkout_session_id')) || data.session?.id;
          if (returnedSessionId) {
            await syncBillingCheckout(returnedSessionId, token);
          }
          await refreshAccess({ force: true });
          Alert.alert('Suscripcion activada', 'Tu suscripcion se activo correctamente.');
        } else {
          await refreshAccess({ force: true });
        }
      } else if (data?.session?.id) {
        await simulateBillingSuccess(data.session.id, token);
        await refreshAccess({ force: true });
        Alert.alert('Suscripcion activada', 'Tu suscripcion se activo correctamente.');
      } else {
        await refreshAccess({ force: true });
      }
    } catch (error) {
      Alert.alert('Suscripcion', error instanceof Error ? error.message : 'No se pudo iniciar la suscripcion.');
    } finally {
      setCheckoutPlan(null);
    }
  };

  return (
    <ScrollView style={compact ? undefined : styles.screen} contentContainerStyle={compact ? undefined : styles.content}>
      {!compact ? (
        <>
          <Text style={styles.eyebrow}>Planes</Text>
          <Text style={styles.title}>Suscripciones</Text>
          <Text style={styles.muted}>Tu plan actual es {plan}. Las funciones se desbloquean desde backend.</Text>
        </>
      ) : null}
      <SectionTabs
        options={['month', 'year'] as const}
        value={billingInterval}
        labels={{ month: 'Mensual', year: 'Anual' }}
        onChange={setBillingInterval}
      />
      {loading ? <ActivityIndicator color={premiumColors.accent} /> : null}
      {plans.map((item) => (
        <View key={item.key} style={[styles.card, plan === item.key && styles.cardActive]}>
          <View style={styles.userHeader}>
            <View style={styles.avatar}>
              <Ionicons name={item.key === 'professional' ? 'briefcase-outline' : item.key === 'premium' ? 'star-outline' : 'leaf-outline'} size={20} color={premiumColors.accent} />
            </View>
            <View style={styles.userIdentity}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.muted}>{item.description}</Text>
            </View>
            {plan === item.key ? <StatusChip label="Actual" icon="checkmark-circle-outline" /> : null}
          </View>
          <Text style={styles.metricSub}>
            {formatMoney(billingInterval === 'year' ? item.yearly_price_cents : item.monthly_price_cents, item.currency)} / {billingInterval === 'year' ? 'año' : 'mes'}
          </Text>
          <View style={styles.featureList}>
            {featuresForPlan(item.key).map((feature) => (
              <View key={feature} style={styles.featureItem}>
                <Ionicons name="checkmark" size={14} color={premiumColors.success} />
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>
          <Action
            label={plan === item.key ? 'Actual' : checkoutPlan === item.key ? 'Procesando...' : item.key === 'free' ? 'Activar' : 'Suscribirme'}
            active={plan === item.key}
            disabled={plan === item.key || checkoutPlan === item.key}
            onPress={() => startCheckout(item.key)}
          />
        </View>
      ))}
    </ScrollView>
  );
}

function Action({
  label,
  onPress,
  danger,
  active,
  disabled,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      style={({ pressed }) => [
        styles.action,
        active && styles.actionActive,
        danger && styles.actionDanger,
        disabled && styles.actionDisabled,
        pressed && !disabled && { opacity: 0.8 },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.actionText, active && styles.actionTextActive, danger && styles.actionTextDanger, disabled && styles.actionTextDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SectionTabs<T extends string>({
  options,
  value,
  labels,
  onChange,
}: {
  options: readonly T[];
  value: T;
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <View style={[styles.segmented, options.length > 3 && styles.segmentedWrap]}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            style={({ pressed }) => [
              styles.segment,
              options.length > 3 && styles.segmentWrap,
              active && styles.segmentActive,
              pressed && { opacity: 0.82 },
            ]}
            onPress={() => onChange(option)}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{labels[option]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function UserFilters({
  roleFilter,
  planFilter,
  onRoleChange,
  onPlanChange,
}: {
  roleFilter: (typeof ROLE_FILTERS)[number];
  planFilter: (typeof PLAN_FILTERS)[number];
  onRoleChange: (value: (typeof ROLE_FILTERS)[number]) => void;
  onPlanChange: (value: (typeof PLAN_FILTERS)[number]) => void;
}) {
  return (
    <View style={styles.filterBlock}>
      <Text style={styles.actionGroupLabel}>Filtrar por rol</Text>
      <View style={styles.rowWrap}>
        {ROLE_FILTERS.map((item) => (
          <Action
            key={item}
            label={item === 'todos' ? 'Todos' : item === 'user' ? 'Usuarios' : formatRole(item)}
            active={roleFilter === item}
            onPress={() => onRoleChange(item)}
          />
        ))}
      </View>
      <Text style={styles.actionGroupLabel}>Filtrar por plan</Text>
      <View style={styles.rowWrap}>
        {PLAN_FILTERS.map((item) => (
          <Action
            key={item}
            label={item === 'todos' ? 'Todos' : formatPlan(item)}
            active={planFilter === item}
            onPress={() => onPlanChange(item)}
          />
        ))}
      </View>
    </View>
  );
}

function CommunityFilters({
  value,
  onChange,
  counts,
}: {
  value: (typeof COMMUNITY_FILTERS)[number];
  onChange: (value: (typeof COMMUNITY_FILTERS)[number]) => void;
  counts: Record<(typeof COMMUNITY_FILTERS)[number], number>;
}) {
  return (
    <View style={styles.filterBlock}>
      <Text style={styles.actionGroupLabel}>Filtrar comunidad</Text>
      <View style={styles.rowWrap}>
        {COMMUNITY_FILTERS.map((item) => (
          <Action
            key={item}
            label={`${formatCommunityFilter(item)} (${counts[item]})`}
            active={value === item}
            onPress={() => onChange(item)}
          />
        ))}
      </View>
    </View>
  );
}

function AdminUserCard({
  user,
  expanded,
  onToggle,
  onChangeRole,
  onChangePlan,
  onChangeStatus,
}: {
  user: AdminUser;
  expanded: boolean;
  onToggle: () => void;
  onChangeRole: (userId: string, role: 'admin' | 'operator' | null) => void;
  onChangePlan: (userId: string, plan: 'free' | 'premium' | 'professional') => void;
  onChangeStatus: (userId: string, status: AccountModerationStatus) => void;
}) {
  const accountStatus = user.account_moderation?.status ?? 'active';
  return (
    <View style={[styles.card, expanded && styles.cardActive]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.userHeaderButton, pressed && { opacity: 0.82 }]}
        onPress={onToggle}
      >
        <View style={styles.userHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(user.name)}</Text>
          </View>
          <View style={styles.userIdentity}>
            <Text style={styles.cardTitle}>{user.name || 'Usuario sin nombre'}</Text>
            <Text style={styles.userEmail} numberOfLines={1}>{user.email || 'Sin correo'}</Text>
            <Text style={styles.small} numberOfLines={1}>{user.id}</Text>
          </View>
          <View style={styles.expandIcon}>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={premiumColors.accent}
            />
          </View>
        </View>
      </Pressable>
      <View style={styles.chipRow}>
        <StatusChip label={formatRole(user.access?.staff_role)} icon="person-circle-outline" />
        <StatusChip label={formatPlan(user.access?.subscription_plan ?? 'free')} icon="diamond-outline" />
        <StatusChip label={formatAccountStatus(accountStatus)} icon="ban-outline" />
        {user.access?.professional_sector ? <StatusChip label={user.access.professional_sector} icon="briefcase-outline" /> : null}
      </View>
      {user.account_moderation?.reason ? <Text style={styles.small}>{user.account_moderation.reason}</Text> : null}
      {expanded ? (
        <>
          <View style={styles.adminActionBlock}>
            <Text style={styles.actionGroupLabel}>Asignar rol</Text>
            <View style={styles.rowWrap}>
              <Action label="Admin" active={user.access?.staff_role === 'admin'} onPress={() => onChangeRole(user.id, 'admin')} />
              <Action label="Operador" active={user.access?.staff_role === 'operator'} onPress={() => onChangeRole(user.id, 'operator')} />
              <Action label="Usuario" active={!user.access?.staff_role} onPress={() => onChangeRole(user.id, null)} />
            </View>
          </View>
          <View style={styles.adminActionBlock}>
            <Text style={styles.actionGroupLabel}>Plan del usuario</Text>
            <View style={styles.rowWrap}>
              <Action label="Free" active={(user.access?.subscription_plan ?? 'free') === 'free'} onPress={() => onChangePlan(user.id, 'free')} />
              <Action label="Premium" active={user.access?.subscription_plan === 'premium'} onPress={() => onChangePlan(user.id, 'premium')} />
              <Action label="Professional" active={user.access?.subscription_plan === 'professional'} onPress={() => onChangePlan(user.id, 'professional')} />
            </View>
          </View>
          <AccountStatusActions user={user} onChangeStatus={onChangeStatus} />
        </>
      ) : (
        <Text style={styles.expandHint}>Toca para administrar</Text>
      )}
    </View>
  );
}

function ReadOnlyUserCard({
  user,
  onChangeStatus,
}: {
  user: AdminUser;
  onChangeStatus: (userId: string, status: AccountModerationStatus) => void;
}) {
  const accountStatus = user.account_moderation?.status ?? 'active';
  return (
    <View style={styles.card}>
      <View style={styles.userHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(user.name)}</Text>
        </View>
        <View style={styles.userIdentity}>
          <Text style={styles.cardTitle}>{user.name || 'Usuario sin nombre'}</Text>
          <Text style={styles.userEmail} numberOfLines={1}>{user.email || 'Sin correo'}</Text>
        </View>
      </View>
      <View style={styles.chipRow}>
        <StatusChip label={formatRole(user.access?.staff_role)} icon="person-circle-outline" />
        <StatusChip label={formatPlan(user.access?.subscription_plan ?? 'free')} icon="diamond-outline" />
        <StatusChip label={formatAccountStatus(accountStatus)} icon="ban-outline" />
      </View>
      {user.account_moderation?.reason ? <Text style={styles.small}>{user.account_moderation.reason}</Text> : null}
      <AccountStatusActions user={user} onChangeStatus={onChangeStatus} />
    </View>
  );
}

function DeletedUserCard({
  user,
  onChangeStatus,
}: {
  user: AdminUser;
  onChangeStatus: (userId: string, status: AccountModerationStatus) => void;
}) {
  return (
    <View style={[styles.card, styles.deletedUserCard]}>
      <View style={styles.userHeader}>
        <View style={styles.avatar}>
          <Ionicons name="trash-outline" size={19} color={premiumColors.danger} />
        </View>
        <View style={styles.userIdentity}>
          <Text style={styles.cardTitle}>{user.name || 'Usuario eliminado'}</Text>
          <Text style={styles.userEmail} numberOfLines={1}>{user.email || 'Sin correo'}</Text>
          <Text style={styles.small} numberOfLines={1}>{user.id}</Text>
        </View>
        <StatusChip label="Eliminado" icon="ban-outline" />
      </View>
      {user.account_moderation?.reason ? <Text style={styles.small}>{user.account_moderation.reason}</Text> : null}
      {user.account_moderation?.actioned_at ? <Text style={styles.small}>Fecha: {formatDate(user.account_moderation.actioned_at)}</Text> : null}
      <View style={styles.rowWrap}>
        <Action label="Activar" onPress={() => onChangeStatus(user.id, 'active')} />
      </View>
    </View>
  );
}

function AccountStatusActions({
  user,
  onChangeStatus,
}: {
  user: AdminUser;
  onChangeStatus: (userId: string, status: AccountModerationStatus) => void;
}) {
  const accountStatus = user.account_moderation?.status ?? 'active';
  return (
    <View style={styles.adminActionBlock}>
      <Text style={styles.actionGroupLabel}>Control de cuenta</Text>
      <View style={styles.rowWrap}>
        {accountStatus !== 'active' ? <Action label="Activar" onPress={() => onChangeStatus(user.id, 'active')} /> : null}
        {accountStatus !== 'suspended' ? <Action label="Suspender" onPress={() => onChangeStatus(user.id, 'suspended')} /> : null}
        {accountStatus !== 'banned' ? <Action label="Banear" onPress={() => onChangeStatus(user.id, 'banned')} danger /> : null}
        {accountStatus !== 'deleted' ? <Action label="Borrar" onPress={() => onChangeStatus(user.id, 'deleted')} danger /> : null}
      </View>
    </View>
  );
}

function PlanAdminCard({
  plan,
  onSave,
}: {
  plan: BillingPlan;
  onSave: (planKey: 'free' | 'premium' | 'professional', data: Partial<BillingPlan>) => void;
}) {
  const [monthly, setMonthly] = useState(String(((plan.monthly_price_cents ?? 0) / 100).toFixed(2)));
  const [yearly, setYearly] = useState(String(((plan.yearly_price_cents ?? 0) / 100).toFixed(2)));
  const [currency, setCurrency] = useState(plan.currency ?? 'usd');
  const [monthlyPriceId, setMonthlyPriceId] = useState(plan.stripe_monthly_price_id ?? '');
  const [yearlyPriceId, setYearlyPriceId] = useState(plan.stripe_yearly_price_id ?? '');

  useEffect(() => {
    setMonthly(String(((plan.monthly_price_cents ?? 0) / 100).toFixed(2)));
    setYearly(String(((plan.yearly_price_cents ?? 0) / 100).toFixed(2)));
    setCurrency(plan.currency ?? 'usd');
    setMonthlyPriceId(plan.stripe_monthly_price_id ?? '');
    setYearlyPriceId(plan.stripe_yearly_price_id ?? '');
  }, [plan]);

  const save = () => {
    onSave(plan.key, {
      currency: currency.toLowerCase(),
      monthly_price_cents: Math.max(0, Math.round(Number(monthly || '0') * 100)),
      yearly_price_cents: Math.max(0, Math.round(Number(yearly || '0') * 100)),
      stripe_monthly_price_id: monthlyPriceId.trim() || null,
      stripe_yearly_price_id: yearlyPriceId.trim() || null,
    });
  };

  return (
    <View style={styles.card}>
      <View style={styles.userHeader}>
        <View style={styles.avatar}>
          <Ionicons name={plan.key === 'professional' ? 'briefcase-outline' : plan.key === 'premium' ? 'star-outline' : 'leaf-outline'} size={20} color={premiumColors.accent} />
        </View>
        <View style={styles.userIdentity}>
          <Text style={styles.cardTitle}>{plan.name}</Text>
          <Text style={styles.muted}>{plan.description}</Text>
        </View>
      </View>
      <TextInput value={currency} onChangeText={setCurrency} style={styles.input} placeholder="Moneda: usd" placeholderTextColor={premiumColors.inkMuted} autoCapitalize="none" />
      <TextInput value={monthly} onChangeText={setMonthly} keyboardType="decimal-pad" style={styles.input} placeholder="Precio mensual" placeholderTextColor={premiumColors.inkMuted} />
      <TextInput value={yearly} onChangeText={setYearly} keyboardType="decimal-pad" style={styles.input} placeholder="Precio anual" placeholderTextColor={premiumColors.inkMuted} />
      <TextInput value={monthlyPriceId} onChangeText={setMonthlyPriceId} style={styles.input} placeholder="Stripe price mensual: price_..." placeholderTextColor={premiumColors.inkMuted} autoCapitalize="none" />
      <TextInput value={yearlyPriceId} onChangeText={setYearlyPriceId} style={styles.input} placeholder="Stripe price anual: price_..." placeholderTextColor={premiumColors.inkMuted} autoCapitalize="none" />
      <Action label="Guardar precios" onPress={save} />
    </View>
  );
}

function MetricTile({ label, value, icon }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.metricTile}>
      <View style={styles.metricTileIcon}>
        <Ionicons name={icon} size={18} color={premiumColors.accent} />
      </View>
      <Text style={styles.metricTileValue}>{value}</Text>
      <Text style={styles.metricTileLabel}>{label}</Text>
    </View>
  );
}

function AuditLogCard({ log }: { log: AuditLog }) {
  return (
    <View style={styles.card}>
      <View style={styles.userHeader}>
        <View style={styles.avatar}>
          <Ionicons name="document-text-outline" size={20} color={premiumColors.accent} />
        </View>
        <View style={styles.userIdentity}>
          <Text style={styles.cardTitle}>{log.action}</Text>
          <Text style={styles.small}>{formatDate(log.created_at)}</Text>
        </View>
      </View>
      <Text style={styles.muted} numberOfLines={1}>Actor: {log.actor_user_id ?? 'sistema'}</Text>
      <Text style={styles.muted} numberOfLines={1}>Objetivo: {log.target_user_id ?? 'general'}</Text>
    </View>
  );
}

function EmptyState({ icon, title, text }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }) {
  return (
    <View style={styles.emptyCard}>
      <Ionicons name={icon} size={30} color={premiumColors.inkSubtle} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function SummaryCard({
  icon,
  value,
  label,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
  tone: 'accent' | 'success' | 'warning';
}) {
  const color = tone === 'success' ? premiumColors.success : tone === 'warning' ? premiumColors.warning : premiumColors.accent;

  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIcon, { backgroundColor: withAlpha(color, 0.14) }]}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function StatusChip({ label, icon }: { label: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.statusChip}>
      <Ionicons name={icon} size={13} color={premiumColors.accent} />
      <Text style={styles.statusChipText}>{label}</Text>
    </View>
  );
}

function withUpdatedAccountModeration(
  users: AdminUser[],
  userId: string,
  moderation: NonNullable<AdminUser['account_moderation']>,
) {
  return users.map((user) => (
    user.id === userId
      ? { ...user, account_moderation: { ...user.account_moderation, ...moderation } }
      : user
  ));
}

function normalizeAccountModeration(
  fallbackStatus: AccountModerationStatus,
  value: unknown,
): NonNullable<AdminUser['account_moderation']> {
  const fallbackPayload = buildAccountStatusPayload(fallbackStatus);
  const fallbackModeration = {
    status: fallbackStatus,
    reason: fallbackPayload.reason ?? null,
    suspended_until: fallbackPayload.suspended_until ?? null,
    actioned_at: new Date().toISOString(),
  };

  if (!isRecord(value)) {
    return fallbackModeration;
  }

  const rawStatus = typeof value.status === 'string' ? value.status : fallbackStatus;
  const status = isAccountModerationStatus(rawStatus) ? rawStatus : fallbackStatus;

  return {
    status,
    reason: typeof value.reason === 'string' ? value.reason : null,
    suspended_until: typeof value.suspended_until === 'string' ? value.suspended_until : null,
    actioned_at: typeof value.actioned_at === 'string' ? value.actioned_at : fallbackModeration.actioned_at,
  };
}

function isAccountModerationStatus(value: string): value is AccountModerationStatus {
  return value === 'active' || value === 'suspended' || value === 'banned' || value === 'deleted';
}

function isDeletedUser(user: AdminUser) {
  return user.account_moderation?.status === 'deleted';
}

function filterUsers(
  users: AdminUser[],
  roleFilter: (typeof ROLE_FILTERS)[number],
  planFilter: (typeof PLAN_FILTERS)[number],
) {
  return users.filter((user) => {
    const role = user.access?.staff_role ?? 'user';
    const plan = user.access?.subscription_plan ?? 'free';
    const roleMatches = roleFilter === 'todos' || role === roleFilter;
    const planMatches = planFilter === 'todos' || plan === planFilter;

    return roleMatches && planMatches;
  });
}

function formatRole(role?: 'admin' | 'operator' | 'user' | null) {
  if (role === 'admin') return 'Admin';
  if (role === 'operator') return 'Operador';
  return 'Usuario';
}

function formatPlan(plan?: string | null) {
  if (plan === 'premium') return 'Premium';
  if (plan === 'professional') return 'Professional';
  return 'Free';
}

function formatStatus(status?: string | null) {
  const labels: Record<string, string> = {
    pending_review: 'Pendiente',
    published: 'Publicado',
    flagged: 'Marcado',
    hidden: 'Oculto',
    removed: 'Removido',
    rejected: 'Rechazado',
  };

  return status ? labels[status] ?? status : 'Pendiente';
}

function formatAccountStatus(status?: AccountModerationStatus | null) {
  if (status === 'suspended') return 'Suspendido';
  if (status === 'banned') return 'Baneado';
  if (status === 'deleted') return 'Eliminado';
  return 'Activo';
}

function accountStatusConfirmText(status: AccountModerationStatus) {
  if (status === 'suspended') return 'La cuenta no podra usar la app durante 7 dias. Esta accion quedara en auditoria.';
  if (status === 'banned') return 'La cuenta quedara bloqueada por infringir las normas de la aplicacion. Esta accion quedara en auditoria.';
  if (status === 'deleted') return 'La cuenta se marcara como eliminada, perdera acceso y su perfil quedara anonimizado. Esta accion quedara en auditoria.';
  return 'La cuenta volvera a estar activa. Esta accion quedara en auditoria.';
}

function accountStatusSuccessText(status: AccountModerationStatus) {
  if (status === 'suspended') return 'El usuario quedo suspendido por 7 dias.';
  if (status === 'banned') return 'El usuario quedo baneado y no podra acceder a la app.';
  if (status === 'deleted') return 'El usuario se movio a la lista de eliminados.';
  return 'El usuario volvio a estar activo.';
}

function buildAccountStatusPayload(status: AccountModerationStatus) {
  if (status === 'suspended') {
    return {
      status,
      reason: 'Cuenta suspendida temporalmente por infringir las normas de la aplicacion.',
      suspended_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  if (status === 'banned') {
    return {
      status,
      reason: 'Cuenta baneada por infringir las normas de la aplicacion.',
    };
  }

  if (status === 'deleted') {
    return {
      status,
      reason: 'Cuenta eliminada por administracion debido a incumplimiento de normas.',
    };
  }

  return {
    status,
    reason: null,
    suspended_until: null,
  };
}

function formatCommunityFilter(filter: (typeof COMMUNITY_FILTERS)[number]) {
  if (filter === 'comentarios') return 'Comentarios';
  return 'Publicaciones';
}

function formatMoney(cents = 0, currency = 'usd') {
  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format((cents ?? 0) / 100);
}

function readUrlParam(url: string, key: string) {
  const match = url.match(new RegExp(`[?&]${key}=([^&#]+)`));
  return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : null;
}

function featuresForPlan(plan: BillingPlan['key']) {
  if (plan === 'professional') {
    return ['Todo Premium', 'Historial extendido', 'Exportaciones', 'Dashboard profesional'];
  }

  if (plan === 'premium') {
    return ['Todo Free', 'Alertas avanzadas', 'Comparativas climaticas', 'Mas detalle diario'];
  }

  return ['Clima actual', 'Comunidad basica', 'Alertas basicas', 'Historial corto'];
}

function isReportedPost(target: CommunityReport['target']): target is CommunityPost {
  return Boolean(target && 'image_url' in target);
}

function getInitials(name?: string | null) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U';
}

function withAlpha(hex: string, alpha: number) {
  const cleanHex = hex.replace('#', '');
  const red = parseInt(cleanHex.slice(0, 2), 16);
  const green = parseInt(cleanHex.slice(2, 4), 16);
  const blue = parseInt(cleanHex.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}

const EXTREME_WEATHER_CODES = new Set([45, 48, 61, 62, 63, 64, 65, 71, 72, 73, 74, 75, 80, 81, 82, 95, 96, 99]);

function extractCurrentWeatherSnapshot(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.current)) {
    return null;
  }

  const temperature = finiteNumber(payload.current.temperature_2m);
  const weatherCode = finiteNumber(payload.current.weather_code);
  const windSpeed = finiteNumber(payload.current.wind_speed_10m);

  if (temperature === null || weatherCode === null || windSpeed === null) {
    return null;
  }

  return {
    temperature,
    weatherCode: Math.round(weatherCode),
    windSpeed,
  };
}

function buildWeatherInsight(
  zoneLabel: string,
  range: WeatherHistoryRange,
  summary: WeatherHistorySummary | null,
  logs: WeatherHistoryLog[],
) {
  const temperatures = logs.map((log) => finiteNumber(log.temperature)).filter((value): value is number => Number.isFinite(value));
  const winds = logs.map((log) => finiteNumber(log.wind_speed)).filter((value): value is number => Number.isFinite(value));
  const detailExtremeEvents = logs.filter((log) => typeof log.weather_code === 'number' && EXTREME_WEATHER_CODES.has(log.weather_code)).length;
  const count = finiteNumber(summary?.logs_count) ?? logs.length;
  const minTemperature = finiteNumber(summary?.min_temperature) ?? (temperatures.length ? Math.min(...temperatures) : null);
  const maxTemperature = finiteNumber(summary?.max_temperature) ?? (temperatures.length ? Math.max(...temperatures) : null);
  const avgTemperature = finiteNumber(summary?.avg_temperature) ?? average(temperatures);
  const avgWindSpeed = finiteNumber(summary?.avg_wind_speed) ?? average(winds);
  const maxWindSpeed = finiteNumber(summary?.max_wind_speed) ?? (winds.length ? Math.max(...winds) : null);
  const extremeEvents = finiteNumber(summary?.extreme_weather_events) ?? detailExtremeEvents;
  const thermalAmplitude = minTemperature !== null && maxTemperature !== null ? maxTemperature - minTemperature : null;
  const variationLabel = thermalAmplitude === null
    ? 'sin datos suficientes'
    : thermalAmplitude <= 3
      ? 'estable'
      : thermalAmplitude <= 8
        ? 'moderada'
        : 'alta';
  const extremeRatio = count > 0 ? extremeEvents / count : 0;
  const extremeLabel = extremeEvents === 0 ? 'Inexistentes' : extremeRatio < 0.12 ? 'Aislados' : 'Frecuentes';
  const fallbackPoints: WeatherHistoryLog[] = [
    { temperature: minTemperature, captured_at: summary?.first_captured_at },
    { temperature: avgTemperature, captured_at: midpointDate(summary?.first_captured_at, summary?.last_captured_at) },
    { temperature: maxTemperature, captured_at: summary?.last_captured_at },
  ];
  const detailPoints = logs.length > 0
    ? logs
    : fallbackPoints.filter((log) => log.temperature !== null && log.temperature !== undefined && Boolean(log.captured_at));
  const story = [
    `En ${zoneLabel}, durante ${range}, encontramos ${count} registros.`,
    `La temperatura se movio entre ${formatNumber(minTemperature)} C y ${formatNumber(maxTemperature)} C, con promedio de ${formatNumber(avgTemperature)} C.`,
    `La variacion fue ${variationLabel} segun la amplitud termica.`,
    `Los eventos extremos fueron ${extremeLabel.toLowerCase()}.`,
  ];

  return {
    count,
    minTemperature,
    maxTemperature,
    avgTemperature,
    avgWindSpeed,
    maxWindSpeed,
    extremeEvents,
    extremeLabel,
    detailPoints,
    story,
  };
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isLowSampleCount(count: unknown) {
  const numericCount = finiteNumber(count);
  return numericCount !== null && numericCount > 0 && numericCount < LOW_SAMPLE_WARNING_THRESHOLD;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function midpointDate(start?: string | null, end?: string | null) {
  if (!start || !end) return start ?? end ?? null;
  const startDate = new Date(start).getTime();
  const endDate = new Date(end).getTime();
  if (!Number.isFinite(startDate) || !Number.isFinite(endDate)) return start;
  return new Date(startDate + (endDate - startDate) / 2).toISOString();
}

function formatNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '--';
}

function formatDate(value?: string) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: premiumColors.surface,
  },
  content: {
    padding: 18,
    paddingTop: 54,
    paddingBottom: 110,
    gap: 14,
  },
  centerCard: {
    margin: 20,
    marginTop: 80,
    padding: 20,
    borderRadius: premiumRadii.xl,
    backgroundColor: premiumColors.surfaceElevated,
    borderWidth: 1,
    borderColor: premiumColors.glassBorder,
    gap: 10,
    ...premiumShadow('medium'),
  },
  eyebrow: premiumType.eyebrow,
  title: premiumType.title,
  muted: {
    color: premiumColors.inkMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  small: {
    color: premiumColors.inkSubtle,
    fontSize: 11,
  },
  adminHero: {
    borderRadius: premiumRadii.xxl,
    backgroundColor: premiumColors.surfaceElevated,
    borderWidth: 1,
    borderColor: premiumColors.glassBorderStrong,
    padding: 18,
    gap: 14,
    overflow: 'hidden',
    ...premiumShadow('strong'),
  },
  topFilterBlock: {
    gap: 8,
  },
  heroGlowTop: {
    position: 'absolute',
    top: -70,
    right: -50,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: premiumColors.auroraAqua,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: premiumColors.accentSoft,
  },
  heroTitle: {
    color: premiumColors.ink,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0,
  },
  heroText: {
    color: premiumColors.inkMuted,
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 310,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: premiumRadii.xl,
    backgroundColor: 'rgba(27,32,39,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(27,32,39,0.12)',
    padding: 14,
  },
  heroStatMain: {
    flex: 1,
  },
  heroStatValue: {
    color: premiumColors.ink,
    fontSize: 26,
    fontWeight: '900',
  },
  heroStatLabel: {
    color: premiumColors.inkSubtle,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroStatDivider: {
    width: StyleSheet.hairlineWidth,
    height: 38,
    marginHorizontal: 16,
    backgroundColor: premiumColors.glassBorder,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    minHeight: 102,
    borderRadius: premiumRadii.xl,
    padding: 12,
    backgroundColor: premiumColors.glass,
    borderWidth: 1,
    borderColor: premiumColors.glassBorder,
    justifyContent: 'space-between',
  },
  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryValue: {
    color: premiumColors.ink,
    fontSize: 22,
    fontWeight: '900',
  },
  summaryLabel: {
    color: premiumColors.inkSubtle,
    fontSize: 11,
    fontWeight: '800',
  },
  dashboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricTile: {
    width: '48%',
    minHeight: 116,
    borderRadius: premiumRadii.xl,
    padding: 13,
    backgroundColor: premiumColors.surfaceElevated,
    borderWidth: 1,
    borderColor: premiumColors.glassBorder,
    gap: 7,
    ...premiumShadow('soft'),
  },
  metricTileIcon: {
    width: 34,
    height: 34,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(243,201,168,0.16)',
  },
  metricTileValue: {
    color: premiumColors.ink,
    fontSize: 24,
    fontWeight: '900',
  },
  metricTileLabel: {
    color: premiumColors.inkSubtle,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15,
  },
  segmented: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: premiumRadii.pill,
    backgroundColor: premiumColors.glass,
    borderWidth: 1,
    borderColor: premiumColors.glassBorder,
    padding: 5,
  },
  segmentedWrap: {
    flexWrap: 'wrap',
    borderRadius: premiumRadii.xl,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    borderRadius: premiumRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentWrap: {
    flexBasis: '48%',
  },
  segmentActive: {
    backgroundColor: premiumColors.accent,
  },
  segmentText: {
    color: premiumColors.inkMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  segmentTextActive: {
    color: premiumColors.accentDeep,
  },
  quickGrid: {
    gap: 10,
  },
  quickCard: {
    minHeight: 66,
    borderRadius: premiumRadii.xl,
    borderWidth: 1,
    borderColor: premiumColors.glassBorder,
    backgroundColor: premiumColors.glass,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quickCardActive: {
    borderColor: premiumColors.accent,
    backgroundColor: 'rgba(226,98,43,0.14)',
  },
  quickIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(243,201,168,0.16)',
  },
  quickTitle: {
    color: premiumColors.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  quickSub: {
    color: premiumColors.inkMuted,
    fontSize: 11,
    marginTop: 1,
  },
  card: {
    padding: 14,
    borderRadius: premiumRadii.xl,
    backgroundColor: premiumColors.surfaceElevated,
    borderWidth: 1,
    borderColor: premiumColors.glassBorder,
    gap: 12,
    ...premiumShadow('soft'),
  },
  cardActive: {
    borderColor: premiumColors.accent,
  },
  reportedCard: {
    borderColor: 'rgba(251,191,36,0.55)',
    backgroundColor: 'rgba(251,191,36,0.08)',
  },
  deletedUserCard: {
    borderColor: 'rgba(251,113,133,0.36)',
    backgroundColor: 'rgba(251,113,133,0.07)',
  },
  moderationImage: {
    width: '100%',
    height: 190,
    borderRadius: premiumRadii.lg,
    backgroundColor: premiumColors.glass,
  },
  cardTitle: {
    color: premiumColors.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userHeaderButton: {
    borderRadius: premiumRadii.lg,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(243,201,168,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(243,201,168,0.3)',
  },
  avatarText: {
    color: premiumColors.accent,
    fontSize: 14,
    fontWeight: '900',
  },
  userIdentity: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  expandIcon: {
    width: 34,
    height: 34,
    borderRadius: premiumRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(243,201,168,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(243,201,168,0.26)',
  },
  expandHint: {
    color: premiumColors.inkSubtle,
    fontSize: 11,
    fontWeight: '800',
  },
  userEmail: {
    color: premiumColors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  metricCard: {
    padding: 18,
    borderRadius: premiumRadii.xl,
    backgroundColor: premiumColors.glass,
    borderWidth: 1,
    borderColor: premiumColors.glassBorderStrong,
    gap: 4,
    ...premiumShadow('medium'),
  },
  metricCardLoading: {
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metricValue: {
    color: premiumColors.accent,
    fontSize: 34,
    fontWeight: '900',
  },
  metricLabel: {
    color: premiumColors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  metricSub: {
    color: premiumColors.inkMuted,
    fontSize: 12,
  },
  metricCta: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricCtaText: {
    color: premiumColors.accent,
    fontSize: 12,
    fontWeight: '900',
  },
  sampleWarningBlock: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: premiumRadii.lg,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.36)',
  },
  sampleWarningText: {
    flex: 1,
    color: '#8a651e',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  badgeText: {
    color: premiumColors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  sectionHeader: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  deletedListHeader: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: premiumColors.glassBorder,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: premiumRadii.lg,
    backgroundColor: 'rgba(226,98,43,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(243,201,168,0.3)',
  },
  infoBannerText: {
    flex: 1,
    color: premiumColors.inkMuted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  filterBlock: {
    gap: 9,
    padding: 12,
    borderRadius: premiumRadii.xl,
    backgroundColor: premiumColors.glass,
    borderWidth: 1,
    borderColor: premiumColors.glassBorder,
  },
  reportBanner: {
    minHeight: 48,
    borderRadius: premiumRadii.xl,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.45)',
    backgroundColor: 'rgba(251,191,36,0.12)',
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reportBannerText: {
    flex: 1,
    color: '#8a651e',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
  },
  sectionTitle: {
    color: premiumColors.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: premiumRadii.pill,
    borderWidth: 1,
    borderColor: 'rgba(243,201,168,0.3)',
    backgroundColor: 'rgba(243,201,168,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusChipText: {
    color: premiumColors.ink,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  actionGroupLabel: {
    color: premiumColors.inkSubtle,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  adminActionBlock: {
    gap: 8,
    padding: 10,
    borderRadius: premiumRadii.lg,
    backgroundColor: 'rgba(27,32,39,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(27,32,39,0.08)',
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  action: {
    borderRadius: premiumRadii.pill,
    borderWidth: 1,
    borderColor: premiumColors.glassBorderStrong,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: premiumColors.glass,
    minHeight: 36,
    justifyContent: 'center',
  },
  actionActive: {
    backgroundColor: premiumColors.accent,
    borderColor: premiumColors.accent,
  },
  actionDanger: {
    borderColor: 'rgba(251,113,133,0.5)',
  },
  actionDisabled: {
    opacity: 0.72,
  },
  actionText: {
    color: premiumColors.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  actionTextActive: {
    color: premiumColors.accentDeep,
  },
  actionTextDanger: {
    color: premiumColors.danger,
  },
  actionTextDisabled: {
    opacity: 0.86,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
  insightModal: {
    maxHeight: '88%',
    borderTopLeftRadius: premiumRadii.xxl,
    borderTopRightRadius: premiumRadii.xxl,
    backgroundColor: premiumColors.surfaceElevated,
    borderWidth: 1,
    borderColor: premiumColors.glassBorderStrong,
    overflow: 'hidden',
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: premiumColors.glassBorder,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: premiumRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: premiumColors.glass,
    borderWidth: 1,
    borderColor: premiumColors.glassBorder,
  },
  insightContent: {
    padding: 18,
    paddingBottom: 34,
    gap: 14,
  },
  loadingBlock: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  warningBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: premiumRadii.lg,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.36)',
  },
  warningText: {
    flex: 1,
    color: '#8a651e',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  storyCard: {
    gap: 8,
    padding: 14,
    borderRadius: premiumRadii.xl,
    backgroundColor: premiumColors.glass,
    borderWidth: 1,
    borderColor: premiumColors.glassBorder,
  },
  storyText: {
    color: premiumColors.inkMuted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  chartBlock: {
    gap: 10,
    padding: 14,
    borderRadius: premiumRadii.xl,
    backgroundColor: premiumColors.surface,
    borderWidth: 1,
    borderColor: premiumColors.glassBorder,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  chartLegend: {
    marginTop: -6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  barLabel: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  insightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  insightStat: {
    width: '48%',
    minHeight: 126,
    borderRadius: premiumRadii.xl,
    padding: 12,
    backgroundColor: premiumColors.glass,
    borderWidth: 1,
    borderColor: premiumColors.glassBorder,
    gap: 6,
  },
  input: {
    color: premiumColors.ink,
    borderWidth: 1,
    borderColor: premiumColors.glassBorder,
    borderRadius: premiumRadii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: premiumColors.glass,
    ...Platform.select({ android: { underlineColorAndroid: 'transparent' as const } }),
  },
  featureList: {
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    color: premiumColors.inkMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyCard: {
    padding: 20,
    borderRadius: premiumRadii.xl,
    backgroundColor: premiumColors.glass,
    borderWidth: 1,
    borderColor: premiumColors.glassBorder,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    color: premiumColors.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  emptyText: {
    color: premiumColors.inkMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
