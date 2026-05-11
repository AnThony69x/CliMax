import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { CitiesProvider } from '../src/core/cities/CitiesContext';
import { usePushNotifications } from '../src/core/notifications/usePushNotifications';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: 'login',
};

export default function RootLayout() {
  usePushNotifications();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <CitiesProvider>
        <Stack
          initialRouteName="login"
          screenOptions={{
            headerStyle: {
              backgroundColor: '#070b18',
            },
            headerTintColor: '#f1f5f9',
            headerTitleStyle: {
              fontWeight: '600',
            },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ headerShown: false }} />
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
      </CitiesProvider>
    </GestureHandlerRootView>
  );
}