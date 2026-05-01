import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { clearToken, saveToken } from '../../core/auth/authStorage';
import { getSession, signInWithPassword, signUp } from '../../core/auth/supabaseClient';

const LOGO = require('../../../assets/images/icon.png');

type AuthMode = 'login' | 'register';
type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ── Campo de formulario inline ── */
function AuthField({
  label,
  error,
  secureTextEntry,
  showToggle,
  isRevealed,
  onToggle,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  error?: string;
  showToggle?: boolean;
  isRevealed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <View>
      <Text style={fieldStyles.label}>{label}</Text>
      <View style={[fieldStyles.inputRow, error ? fieldStyles.inputRowError : undefined]}>
        <TextInput
          style={fieldStyles.input}
          placeholderTextColor="rgba(148,163,184,0.5)"
          secureTextEntry={secureTextEntry && !isRevealed}
          {...props}
        />
        {showToggle && (
          <Pressable onPress={onToggle} style={fieldStyles.toggleBtn} hitSlop={8}>
            <Ionicons
              name={isRevealed ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color="rgba(148,163,184,0.7)"
            />
          </Pressable>
        )}
      </View>
      {error ? <Text style={fieldStyles.errorText}>{error}</Text> : null}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(148,163,184,0.9)',
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  inputRowError: {
    borderColor: 'rgba(248,113,113,0.6)',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#f1f5f9',
    paddingVertical: 13,
  },
  toggleBtn: { padding: 4 },
  errorText: {
    marginTop: 5,
    fontSize: 12,
    color: '#f87171',
  },
});

/* ── Pantalla principal ── */
export default function AuthScreen({ initialMode = 'login' }: { initialMode?: AuthMode }) {
  const router = useRouter();
  const [mode, setMode]         = useState<AuthMode>(initialMode);
  const [checking, setChecking] = useState(true);

  const [name, setName]                     = useState('');
  const [email, setEmail]                   = useState('');
  const [password, setPassword]             = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]     = useState(false);
  const [showConfirm, setShowConfirm]       = useState(false);
  const [errors, setErrors]                 = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting]     = useState(false);

  const confirmAnim  = useRef(new Animated.Value(0)).current;
  const passwordAnim = useRef(new Animated.Value(0)).current;
  const nameAnim     = useRef(new Animated.Value(0)).current;

  const isLogin      = mode === 'login';
  const emailIsValid = EMAIL_REGEX.test(email.trim().toLowerCase());

  /* Verificar sesión activa al montar */
  useEffect(() => {
    getSession()
      .then((result) => {
        const confirmed = (result?.session?.user as any)?.email_confirmed_at;
        if (confirmed) router.replace('/(tabs)');
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);

  const handleGuest = async () => {
    await clearToken();
    router.replace('/(tabs)');
  };

  useEffect(() => {
    Animated.timing(nameAnim, {
      toValue: isLogin ? 0 : 1,
      duration: 260,
      useNativeDriver: false,
    }).start();
  }, [mode]);

  useEffect(() => {
    Animated.timing(confirmAnim, {
      toValue: isLogin ? 0 : 1,
      duration: 280,
      useNativeDriver: false,
    }).start();
  }, [mode]);

  useEffect(() => {
    Animated.timing(passwordAnim, {
      toValue: !isLogin || emailIsValid ? 1 : 0,
      duration: 260,
      useNativeDriver: false,
    }).start();
  }, [isLogin, emailIsValid]);

  const toggleMode = () => {
    setMode((m) => (m === 'login' ? 'register' : 'login'));
    setErrors({});
    setName('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirm(false);
  };

  const clearError = (field: keyof FieldErrors) =>
    setErrors((prev) => ({ ...prev, [field]: undefined }));

  const validate = (): boolean => {
    const next: FieldErrors = {};
    const trimmedEmail = email.trim().toLowerCase();

    if (!isLogin && !name.trim()) {
      next.name = 'Ingresa tu nombre.';
    }
    if (!trimmedEmail) {
      next.email = 'Ingresa tu correo electrónico.';
    } else if (!EMAIL_REGEX.test(trimmedEmail)) {
      next.email = 'El formato del correo no es válido.';
    }
    if (!password) {
      next.password = 'Ingresa tu contraseña.';
    } else if (password.length < 6) {
      next.password = 'La contraseña debe tener al menos 6 caracteres.';
    }
    if (!isLogin) {
      if (!confirmPassword) {
        next.confirmPassword = 'Confirma tu contraseña.';
      } else if (password !== confirmPassword) {
        next.confirmPassword = 'Las contraseñas no coinciden.';
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const trimmedEmail = email.trim().toLowerCase();
    setIsSubmitting(true);
    try {
      if (isLogin) {
        const { session } = await signInWithPassword(trimmedEmail, password);
        if (session?.access_token) await saveToken(session.access_token);
        router.replace('/(tabs)');
      } else {
        await signUp(name.trim(), trimmedEmail, password);
        setMode('login');
        setName('');
        setPassword('');
        setConfirmPassword('');
        setErrors({ email: 'Cuenta creada. Revisa tu correo para confirmarla antes de entrar.' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
      setErrors({ email: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  const nameMaxHeight    = nameAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 90] });
  const nameMarginBottom = nameAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 16] });

  const passwordMaxHeight    = passwordAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 90] });
  const passwordMarginTop    = passwordAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 16] });

  const confirmMaxHeight  = confirmAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 110] });
  const confirmMarginTop  = confirmAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 16] });

  if (checking) {
    return (
      <View style={styles.splash}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <Image source={LOGO} style={styles.splashLogo} resizeMode="contain" />
        <Text style={styles.splashTitle}>CliMax</Text>
        <ActivityIndicator color="#38bdf8" style={{ marginTop: 20 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Círculos de fondo para dar profundidad */}
      <View style={styles.bgGlow1} />
      <View style={styles.bgGlow2} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Wrapper de sombra */}
        <View style={styles.cardShadow}>
          <View style={styles.blurCard}>
            <View style={styles.cardInner}>

              {/* Logo */}
              <View style={styles.logoWrap}>
                <Image source={LOGO} style={styles.logo} resizeMode="contain" />
              </View>

              {/* Título y subtítulo */}
              <View style={styles.headingWrap}>
                <Text style={styles.heading}>
                  {isLogin ? 'Bienvenido' : 'Crea tu cuenta'}
                </Text>
                <Text style={styles.subheading}>
                  {isLogin
                    ? 'Ingresa con tu cuenta para continuar.'
                    : 'Regístrate con tu correo y contraseña.'}
                </Text>
              </View>

              {/* Campos */}
              <View style={styles.fields}>

                {/* Nombre (solo registro) */}
                <Animated.View style={{ overflow: 'hidden', maxHeight: nameMaxHeight, marginBottom: nameMarginBottom }}>
                  <AuthField
                    label="Nombre"
                    placeholder="Tu nombre"
                    value={name}
                    onChangeText={(v) => { setName(v); clearError('name'); }}
                    autoCapitalize="words"
                    error={errors.name}
                  />
                </Animated.View>

                {/* Correo */}
                <AuthField
                  label="Correo electrónico"
                  placeholder="tu@email.com"
                  value={email}
                  onChangeText={(v) => { setEmail(v); clearError('email'); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={errors.email}
                />

                {/* Contraseña */}
                <Animated.View style={{ overflow: 'hidden', maxHeight: passwordMaxHeight, marginTop: passwordMarginTop }}>
                  <AuthField
                    label="Contraseña"
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChangeText={(v) => { setPassword(v); clearError('password'); }}
                    secureTextEntry
                    showToggle
                    isRevealed={showPassword}
                    onToggle={() => setShowPassword((s) => !s)}
                    error={errors.password}
                  />
                </Animated.View>

                {/* Confirmar contraseña (solo registro) */}
                <Animated.View style={{ overflow: 'hidden', maxHeight: confirmMaxHeight, marginTop: confirmMarginTop }}>
                  <AuthField
                    label="Confirmar contraseña"
                    placeholder="Repite tu contraseña"
                    value={confirmPassword}
                    onChangeText={(v) => { setConfirmPassword(v); clearError('confirmPassword'); }}
                    secureTextEntry
                    showToggle
                    isRevealed={showConfirm}
                    onToggle={() => setShowConfirm((s) => !s)}
                    error={errors.confirmPassword}
                  />
                </Animated.View>
              </View>

              {/* Botón principal */}
              <Pressable
                onPress={handleSubmit}
                disabled={isSubmitting}
                style={({ pressed }) => [
                  styles.submitBtn,
                  pressed && !isSubmitting && styles.submitBtnPressed,
                  isSubmitting && styles.submitBtnDisabled,
                ]}
              >
                {isSubmitting && <ActivityIndicator size="small" color="#082f49" style={{ marginRight: 8 }} />}
                <Text style={styles.submitBtnText}>
                  {isSubmitting
                    ? (isLogin ? 'Iniciando sesión...' : 'Registrando...')
                    : (isLogin ? 'Iniciar sesión' : 'Registrarme')}
                </Text>
              </Pressable>

              {/* Divisor */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>o</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Toggle modo */}
              <Pressable onPress={toggleMode} style={styles.toggleMode}>
                <Text>
                  <Text style={styles.toggleModeGray}>
                    {isLogin ? '¿Eres nuevo?  ' : '¿Ya tienes cuenta?  '}
                  </Text>
                  <Text style={styles.toggleModeBlue}>
                    {isLogin ? 'Crea tu cuenta' : 'Inicia sesión'}
                  </Text>
                </Text>
              </Pressable>

              {/* Entrar como invitado */}
              <Pressable onPress={handleGuest} style={styles.guestBtn}>
                <Text style={styles.guestText}>Entrar como invitado</Text>
              </Pressable>

            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  /* ── Splash ── */
  splash: {
    flex: 1,
    backgroundColor: '#070b18',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  splashLogo: { width: 80, height: 80, borderRadius: 18 },
  splashTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#f1f5f9',
    letterSpacing: -0.5,
  },

  /* ── Pantalla principal ── */
  container: {
    flex: 1,
    backgroundColor: '#070b18',
  },

  /* Destellos de fondo */
  bgGlow1: {
    position: 'absolute',
    top: -120,
    left: -100,
    width: 400,
    height: 400,
    borderRadius: 999,
    backgroundColor: 'rgba(2,87,129,0.28)',
  },
  bgGlow2: {
    position: 'absolute',
    bottom: -80,
    right: -80,
    width: 300,
    height: 300,
    borderRadius: 999,
    backgroundColor: 'rgba(56,189,248,0.12)',
  },

  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 56,
  },

  /* Card */
  cardShadow: {
    borderRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.7,
    shadowRadius: 40,
    elevation: 20,
  },
  blurCard: {
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(8,16,42,0.82)',
  },
  cardInner: {
    padding: 28,
    gap: 20,
  },

  /* Logo */
  logoWrap: { alignItems: 'center' },
  logo: { width: 90, height: 90, borderRadius: 20 },

  /* Heading */
  headingWrap: { gap: 6, alignItems: 'center' },
  heading: {
    color: '#f1f5f9',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subheading: {
    color: 'rgba(148,163,184,0.85)',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },

  /* Fields */
  fields: { gap: 16 },

  /* Botón submit */
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#38bdf8',
    borderRadius: 18,
    paddingVertical: 16,
  },
  submitBtnPressed: { backgroundColor: '#0284c7' },
  submitBtnDisabled: { backgroundColor: 'rgba(51,65,85,0.8)' },
  submitBtnText: {
    color: '#082f49',
    fontSize: 16,
    fontWeight: '800',
  },

  /* Divisor */
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dividerText: {
    color: 'rgba(148,163,184,0.6)',
    fontSize: 13,
  },

  /* Toggle modo */
  toggleMode: { alignItems: 'center', paddingVertical: 4 },
  toggleModeGray: { color: 'rgba(148,163,184,0.85)', fontSize: 15 },
  toggleModeBlue: { color: '#38bdf8', fontSize: 15, fontWeight: '700' },

  /* Invitado */
  guestBtn: { alignItems: 'center', paddingVertical: 4 },
  guestText: { color: 'rgba(148,163,184,0.5)', fontSize: 13 },
});
