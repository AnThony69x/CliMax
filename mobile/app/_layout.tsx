import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

export const unstable_settings = {
  anchor: 'welcome',
};

export default function RootLayout() {
  return (
    <>
      <Stack
        initialRouteName="welcome"
        screenOptions={{
          headerStyle: {
            backgroundColor: '#F1F5F2',
          },
          headerTintColor: '#0B1411',
          headerTitleStyle: {
            fontWeight: '600',
          },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Iniciar sesión' }} />
        <Stack.Screen name="register" options={{ title: 'Registrarse' }} />
        <Stack.Screen name="search" options={{ title: 'Buscar' }} />
        <Stack.Screen name="alerts" options={{ title: 'Alertas' }} />
        <Stack.Screen name="profile" options={{ title: 'Mi perfil' }} />
        <Stack.Screen name="settings" options={{ title: 'Configuración' }} />
        <Stack.Screen
          name="alert/[id]"
          options={{
            title: 'Detalle de alerta',
            presentation: 'modal',
          }}
        />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Info' }} />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}