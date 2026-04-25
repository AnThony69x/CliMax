import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { clearToken, getToken } from '../../core/auth/authStorage';

export default function WelcomeScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const loadSession = async () => {
      const token = await getToken();
      if (token) {
        router.replace('/(tabs)');
        return;
      }
      setChecking(false);
    };

    loadSession();
  }, [router]);

  const handleGuest = async () => {
    await clearToken();
    router.replace('/(tabs)');
  };

  if (checking) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>CliMax</Text>
        <Text style={styles.subtitle}>Cargando...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Bienvenido</Text>
        <Text style={styles.subtitle}>Inicia sesion o entra como invitado</Text>

        <Pressable style={styles.button} onPress={() => router.push('/login')}>
          <Text style={styles.buttonText}>Iniciar sesion</Text>
        </Pressable>

        <Pressable style={styles.outlineButton} onPress={() => router.push('/register')}>
          <Text style={styles.outlineText}>Registrarse</Text>
        </Pressable>

        <Pressable style={styles.linkButton} onPress={handleGuest}>
          <Text style={styles.linkText}>Entrar como invitado</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F1F5F2',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    shadowColor: '#0B1411',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0B1411',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#52655A',
  },
  button: {
    marginTop: 20,
    backgroundColor: '#2A7A4B',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  outlineButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#2A7A4B',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  outlineText: {
    color: '#2A7A4B',
    fontSize: 15,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: '#52655A',
    fontSize: 14,
  },
});
