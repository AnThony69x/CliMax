import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { AppBootSplash } from '../src/components/AppBootSplash';
import { AccessProvider } from '../src/core/access/AccessContext';
import { completeAuthSessionFromUrl } from '../src/core/auth/completeAuthFromUrl';
import { CitiesProvider } from '../src/core/cities/CitiesContext';
import { installFetchLogger } from '../src/core/network/installFetchLogger';
import { usePushNotifications } from '../src/core/notifications/usePushNotifications';
import { WeatherSceneProvider } from '../src/core/weather/WeatherSceneContext';
import { premiumColors } from '../src/theme/premium';

SplashScreen.preventAutoHideAsync();
if (Constants.appOwnership !== 'expo') {
  SplashScreen.setOptions({
    duration: 450,
    fade: true,
  });
}
installFetchLogger();

export const unstable_settings = {
  anchor: 'login',
};

export default function RootLayout() {
  const router = useRouter();
  const [showBootSplash, setShowBootSplash] = useState(true);

  usePushNotifications();

  useEffect(() => {
    let isMounted = true;
    const nativeSplashTimer = setTimeout(() => {
      SplashScreen.hideAsync();
    }, 120);
    const bootSplashTimer = setTimeout(() => {
      if (isMounted) {
        setShowBootSplash(false);
      }
    }, 1650);

    return () => {
      isMounted = false;
      clearTimeout(nativeSplashTimer);
      clearTimeout(bootSplashTimer);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const handleUrl = async (url: string | null) => {
      if (!url) return;

      if (url.includes('checkout=success') || url.includes('checkout=cancel')) {
        if (isMounted) {
          router.replace('/(tabs)/subscriptions' as any);
        }
        return;
      }

      try {
        const result = await completeAuthSessionFromUrl(url);
        if (result.completed && isMounted) {
          router.replace((result.isPasswordRecovery ? '/reset-password?fromLink=1' : '/(tabs)') as any);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[auth] No se pudo completar el deep link: ${message}`);
      }
    };

    Linking.getInitialURL().then((url) => {
      void handleUrl(url);
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url);
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <WeatherSceneProvider>
      <CitiesProvider>
        <AccessProvider>
        <Stack
          initialRouteName="login"
          screenOptions={{
            headerStyle: {
              backgroundColor: premiumColors.surface,
            },
            headerShadowVisible: false,
            headerTintColor: premiumColors.ink,
            headerTitleStyle: {
              fontWeight: '800',
            },
            contentStyle: {
              backgroundColor: premiumColors.surface,
            },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ headerShown: false }} />
          <Stack.Screen name="reset-password" options={{ headerShown: false }} />
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
        {showBootSplash ? <AppBootSplash /> : null}
        <StatusBar style="light" />
        </AccessProvider>
      </CitiesProvider>
      </WeatherSceneProvider>
    </GestureHandlerRootView>
  );
}
