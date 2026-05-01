import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, Input } from '../../components';
import { signInWithPassword } from '../../core/auth/supabaseClient';
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
        const { session } = await signInWithPassword(email.trim(), password);
        if (session?.access_token) {
          await saveToken(session.access_token);
        }
        router.replace('/(tabs)');
      } catch (error) {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'No se pudo iniciar sesión');
      }
    };

    run();
  };

  return (
    <View style={styles.container}>
      <Card variant="elevated">
        <Text style={styles.title}>Iniciar sesión</Text>
        <Text style={styles.subtitle}>Accede a tu cuenta</Text>

        <View style={styles.form}>
          <Input
            label="Correo"
            value={email}
            onChangeText={setEmail}
            placeholder="tu@correo.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Input
            label="Contraseña"
            value={password}
            onChangeText={setPassword}
            placeholder="********"
            secureTextEntry
          />
        </View>

        {message ? <Text style={styles.error}>{message}</Text> : null}

        <Button
          title={status === 'loading' ? 'Entrando...' : 'Entrar'}
          onPress={handleLogin}
          variant="primary"
          loading={status === 'loading'}
          disabled={status === 'loading'}
        />
      </Card>
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
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0B1411',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#52655A',
    marginBottom: 24,
  },
  form: {
    gap: 16,
  },
  error: {
    marginTop: 12,
    fontSize: 12,
    color: '#A33A3A',
  },
});
