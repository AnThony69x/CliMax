import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { clearToken } from '../../core/auth/authStorage';
import { signOut } from '../../core/auth/supabaseClient';

type SettingItem = {
  id: string;
  label: string;
  description?: string;
  icon: string;
  type: 'toggle' | 'action' | 'navigation';
  value?: boolean;
  onPress?: () => void;
};

export default function SettingsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState(true);
  const [location, setLocation] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  const handleToggle = (setting: string, value: boolean) => {
    switch (setting) {
      case 'notifications': setNotifications(value); break;
      case 'location':      setLocation(value);      break;
      case 'darkMode':      setDarkMode(value);       break;
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Cerrar sesión',
      '¿Estás seguro de que quieres salir?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: async () => {
            try { await signOut(); } catch { /* ignorar errores de red */ }
            await clearToken();
            router.replace('/login');
          },
        },
      ]
    );
  };

  const handleClearCache = () => {
    Alert.alert('Limpiar caché', '¿Limpiar datos guardados en caché?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Limpiar', onPress: () => Alert.alert('Listo', 'Caché limpiada') },
    ]);
  };

  const settings: SettingItem[] = [
    { id: 'notifications', label: 'Notificaciones', description: 'Recibir alertas climáticas', icon: '🔔', type: 'toggle', value: notifications },
    { id: 'location',      label: 'Ubicación en tiempo real', description: 'Rastrear ubicación constantemente', icon: '📍', type: 'toggle', value: location },
    { id: 'darkMode',      label: 'Modo oscuro', description: 'Cambiar tema de la app', icon: '🌙', type: 'toggle', value: darkMode },
  ];

  const actions: SettingItem[] = [
    { id: 'account',    label: 'Cuenta',         description: 'Gestionar tu cuenta',              icon: '👤', type: 'navigation', onPress: () => router.push('/profile' as any) },
    { id: 'privacy',    label: 'Privacidad',      description: 'Cómo usamos tus datos',            icon: '🔒', type: 'navigation', onPress: () => router.push('/modal') },
    { id: 'help',       label: 'Ayuda',           description: 'Preguntas frecuentes',             icon: '❓', type: 'navigation', onPress: () => router.push('/modal') },
    { id: 'clearCache', label: 'Limpiar caché',   description: 'Liberar espacio de almacenamiento', icon: '🗑️', type: 'action',     onPress: handleClearCache },
  ];

  const renderSetting = (item: SettingItem) => (
    <View key={item.id} style={styles.settingItem}>
      <Text style={styles.settingIcon}>{item.icon}</Text>
      <View style={styles.settingContent}>
        <Text style={styles.settingLabel}>{item.label}</Text>
        {item.description && <Text style={styles.settingDescription}>{item.description}</Text>}
      </View>
      {item.type === 'toggle' ? (
        <Switch
          value={item.value}
          onValueChange={(value) => handleToggle(item.id, value)}
          trackColor={{ false: '#D6DED9', true: '#2A7A4B' }}
          thumbColor="#FFFFFF"
        />
      ) : (
        <Text style={styles.chevron}>→</Text>
      )}
    </View>
  );

  const renderAction = (item: SettingItem) => (
    <Pressable
      key={item.id}
      style={({ pressed }) => [styles.settingItem, pressed && styles.settingItemPressed]}
      onPress={item.onPress}
    >
      <Text style={styles.settingIcon}>{item.icon}</Text>
      <View style={styles.settingContent}>
        <Text style={styles.settingLabel}>{item.label}</Text>
        {item.description && <Text style={styles.settingDescription}>{item.description}</Text>}
      </View>
      <Text style={styles.chevron}>→</Text>
    </Pressable>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Configuración</Text>
        <Text style={styles.subtitle}>Personaliza tu experiencia</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>General</Text>
        {settings.map(renderSetting)}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Otros</Text>
        {actions.map(renderAction)}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sesión</Text>
        <Pressable
          style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutButtonPressed]}
          onPress={handleLogout}
        >
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Text style={styles.version}>CliMax v1.0.0</Text>
        <Text style={styles.copyright}>© 2026 CliMax</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#F1F5F2' },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '700', color: '#0B1411' },
  subtitle: { marginTop: 4, fontSize: 14, color: '#52655A' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#52655A', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  settingItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, marginBottom: 8, gap: 12 },
  settingItemPressed: { opacity: 0.85 },
  settingIcon: { fontSize: 20 },
  settingContent: { flex: 1 },
  settingLabel: { fontSize: 15, fontWeight: '500', color: '#0B1411' },
  settingDescription: { marginTop: 2, fontSize: 13, color: '#6E7F77' },
  chevron: { fontSize: 16, color: '#6E7F77' },
  logoutButton: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#FDEAEA' },
  logoutButtonPressed: { backgroundColor: '#FDEAEA' },
  logoutText: { fontSize: 15, fontWeight: '500', color: '#A33A3A' },
  footer: { alignItems: 'center', marginTop: 20, marginBottom: 40 },
  version: { fontSize: 13, color: '#6E7F77' },
  copyright: { marginTop: 4, fontSize: 12, color: '#9CA39F' },
});
