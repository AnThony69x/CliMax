import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { login } from '../../core/auth/authApi';
import { saveToken } from '../../core/auth/authStorage';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleLogin = () => {
    const run = async () => {
      setStatus('loading');
      setMessage('');

      try {
        const response = await login(email.trim(), password);
        await saveToken(response.token);
        router.replace('/(tabs)');
      } catch (error) {
        setStatus('error');
        setMessage('No se pudo iniciar sesion');
      }
    };

    run();
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Iniciar sesion</Text>
        <Text style={styles.subtitle}>Accede a tu cuenta</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Correo</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="tu@correo.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Contrasena</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="********"
            secureTextEntry
          />
        </View>

        {message ? <Text style={styles.error}>{message}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            status === 'loading' && styles.buttonDisabled,
            pressed && status !== 'loading' && styles.buttonPressed,
          ]}
          disabled={status === 'loading'}
          onPress={handleLogin}
        >
          <Text style={styles.buttonText}>
            {status === 'loading' ? 'Entrando...' : 'Entrar'}
          </Text>
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
    borderRadius: 16,
    padding: 24,
    shadowColor: '#0B1411',
    shadowOpacity: 0.08,
    shadowRadius: 20,
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
  field: {
    marginTop: 18,
  },
  label: {
    fontSize: 12,
    color: '#52655A',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D6DED9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#0B1411',
    backgroundColor: '#FBFDFB',
  },
  button: {
    marginTop: 24,
    backgroundColor: '#2A7A4B',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    marginTop: 10,
    fontSize: 12,
    color: '#A33A3A',
  },
});
