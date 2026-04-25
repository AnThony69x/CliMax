import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

export const unstable_settings = {
  anchor: 'welcome',
};

export default function RootLayout() {
  return (
    <>
      <Stack initialRouteName="welcome">
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Iniciar sesion' }} />
        <Stack.Screen name="register" options={{ title: 'Registrarse' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Info' }} />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
