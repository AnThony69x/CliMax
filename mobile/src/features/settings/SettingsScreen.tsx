import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PremiumReveal } from '../../components/PremiumMotion';
import { clearToken } from '../../core/auth/authStorage';
import { signOut } from '../../core/auth/supabaseClient';
import { premiumColors, premiumRadii, premiumShadow, premiumType } from '../../theme/premium';
import { useWeatherScene } from '../../core/weather/WeatherSceneContext';
import { WeatherSceneBackground } from '../../components/weather/WeatherSceneBackground';
import { useAccountPreferences } from '../../core/preferences/accountPreferences';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type SettingItem = {
  id: string;
  label: string;
  description?: string;
  icon: IoniconName;
  type: 'toggle' | 'action' | 'navigation';
  value?: boolean;
  onPress?: () => void;
};

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { code: weatherCode, isNight, scene } = useWeatherScene();
  const preferences = useAccountPreferences();
  const [notifications, setNotifications] = useState(true);
  const [location, setLocation] = useState(true);
  const [darkMode, setDarkMode] = useState(true);

  const handleToggle = (setting: string, value: boolean) => {
    switch (setting) {
      case 'notifications': setNotifications(value); break;
      case 'location': setLocation(value); break;
      case 'darkMode': setDarkMode(value); break;
    }
  };

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro de que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: async () => {
          try { await signOut(); } catch {}
          await clearToken();
          router.replace('/login');
        },
      },
    ]);
  };

  const handleClearCache = () => {
    Alert.alert('Limpiar caché', '¿Limpiar datos guardados en caché?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Limpiar', onPress: () => Alert.alert('Listo', 'Caché limpiada') },
    ]);
  };

  const settings: SettingItem[] = [
    { id: 'notifications', label: 'Notificaciones', description: 'Recibir alertas climáticas críticas', icon: 'notifications-outline', type: 'toggle', value: notifications },
    { id: 'location', label: 'Ubicación en tiempo real', description: 'Mantener precisión para clima y reportes', icon: 'navigate-outline', type: 'toggle', value: location },
    { id: 'darkMode', label: 'Modo premium', description: 'Tema nocturno optimizado para CliMax', icon: 'moon-outline', type: 'toggle', value: darkMode },
  ];

  const actions: SettingItem[] = [
    { id: 'account', label: 'Cuenta', description: 'Gestionar perfil y actividad', icon: 'person-circle-outline', type: 'navigation', onPress: () => router.push('/profile' as any) },
    { id: 'privacy', label: 'Privacidad', description: 'Cómo usamos tus datos', icon: 'lock-closed-outline', type: 'navigation', onPress: () => router.push('/modal') },
    { id: 'help', label: 'Ayuda', description: 'Preguntas frecuentes', icon: 'help-circle-outline', type: 'navigation', onPress: () => router.push('/modal') },
    { id: 'clearCache', label: 'Limpiar caché', description: 'Liberar espacio de almacenamiento', icon: 'trash-outline', type: 'action', onPress: handleClearCache },
  ];

  const renderSetting = (item: SettingItem) => (
    <View key={item.id} style={styles.settingItem}>
      <View style={styles.settingIcon}>
        <Ionicons name={item.icon} size={20} color={scene.accent} />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingLabel}>{item.label}</Text>
        {item.description && <Text style={styles.settingDescription}>{item.description}</Text>}
      </View>
      {item.type === 'toggle' ? (
        <Switch
          value={item.value}
          onValueChange={(value) => handleToggle(item.id, value)}
          trackColor={{ false: 'rgba(148,163,184,0.32)', true: `${premiumColors.accent}8c` }}
          thumbColor={item.value ? premiumColors.accentSoft : premiumColors.inkSubtle}
        />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={premiumColors.inkMuted} />
      )}
    </View>
  );

  const renderAction = (item: SettingItem) => (
    <Pressable
      key={item.id}
      style={({ pressed }) => [styles.settingItem, pressed && styles.settingItemPressed]}
      onPress={item.onPress}
    >
      <View style={styles.settingIcon}>
        <Ionicons name={item.icon} size={20} color={scene.accent} />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingLabel}>{item.label}</Text>
        {item.description && <Text style={styles.settingDescription}>{item.description}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={premiumColors.inkMuted} />
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={scene.ink === 'dark' ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
      <WeatherSceneBackground code={weatherCode} isNight={isNight} particlesEnabled={!preferences.dataSaver} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 18, paddingBottom: Math.max(insets.bottom, 16) + 32 },
        ]}
      >
        <PremiumReveal style={styles.header}>
          <Text style={styles.eyebrow}>Preferencias</Text>
          <Text style={styles.title}>Configuración</Text>
          <Text style={styles.subtitle}>Ajusta notificaciones, privacidad y experiencia visual.</Text>
        </PremiumReveal>

        <PremiumReveal delay={80} style={styles.section}>
          <Text style={styles.sectionTitle}>General</Text>
          <View style={styles.panel}>{settings.map(renderSetting)}</View>
        </PremiumReveal>

        <PremiumReveal delay={150} style={styles.section}>
          <Text style={styles.sectionTitle}>Otros</Text>
          <View style={styles.panel}>{actions.map(renderAction)}</View>
        </PremiumReveal>

        <PremiumReveal delay={220} style={styles.section}>
          <Text style={styles.sectionTitle}>Sesión</Text>
          <Pressable
            style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutButtonPressed]}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={18} color={premiumColors.danger} />
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </Pressable>
        </PremiumReveal>

        <View style={styles.footer}>
          <Text style={styles.version}>CliMax v1.0.0</Text>
          <Text style={styles.copyright}>© 2026 CliMax</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: premiumColors.surface, overflow: 'hidden' },
  scroll: { paddingHorizontal: 20, gap: 22 },
  header: { gap: 7 },
  eyebrow: premiumType.eyebrow,
  title: premiumType.title,
  subtitle: { ...premiumType.body, maxWidth: 340 },
  section: { gap: 12 },
  sectionTitle: { ...premiumType.sectionTitle, paddingHorizontal: 2 },
  panel: {
    borderRadius: premiumRadii.xl,
    backgroundColor: premiumColors.surfaceElevated,
    borderWidth: 1,
    borderColor: premiumColors.glassBorder,
    overflow: 'hidden',
    ...premiumShadow('medium'),
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(27,32,39,0.08)',
  },
  settingItemPressed: {
    backgroundColor: 'rgba(27,32,39,0.045)',
    transform: [{ scale: 0.995 }],
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: premiumRadii.md,
    backgroundColor: `${premiumColors.accent}1a`,
    borderWidth: 1,
    borderColor: `${premiumColors.accentSoft}38`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingContent: { flex: 1, minWidth: 0 },
  settingLabel: { fontSize: 15, fontWeight: '800', color: premiumColors.ink },
  settingDescription: { marginTop: 3, fontSize: 12, lineHeight: 17, color: premiumColors.inkSubtle },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: `${premiumColors.danger}1a`,
    padding: 16,
    borderRadius: premiumRadii.lg,
    borderWidth: 1,
    borderColor: `${premiumColors.danger}59`,
  },
  logoutButtonPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  logoutText: { fontSize: 15, fontWeight: '800', color: premiumColors.danger },
  footer: { alignItems: 'center', marginTop: 4, marginBottom: 8 },
  version: { fontSize: 13, color: premiumColors.inkSubtle },
  copyright: { marginTop: 4, fontSize: 12, color: 'rgba(148,163,184,0.62)' },
});
