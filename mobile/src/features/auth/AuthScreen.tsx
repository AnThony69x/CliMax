import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { AuthWeatherBubbles } from '../../components/AuthWeatherBubbles';
import { GaruaRainOverlay } from '../../components/GaruaRainOverlay';
import { PremiumReveal } from '../../components/PremiumMotion';
import { useAccess } from '../../core/access/AccessContext';
import { clearToken, saveToken } from '../../core/auth/authStorage';
import {
  getSession,
  requestPasswordReset,
  signOut,
  signInWithPassword,
  signUp,
} from '../../core/auth/supabaseClient';
import { premiumColors, premiumRadii, premiumShadow } from '../../theme/premium';

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
    fontWeight: '700',
    color: premiumColors.inkSubtle,
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: premiumColors.glass,
    borderWidth: 1,
    borderColor: premiumColors.glassBorder,
    borderRadius: premiumRadii.md,
    paddingHorizontal: 14,
  },
  inputRowError: {
    borderColor: 'rgba(248,113,113,0.6)',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: premiumColors.ink,
    paddingVertical: 13,
  },
  toggleBtn: { padding: 4 },
  errorText: {
    marginTop: 5,
    fontSize: 12,
    color: premiumColors.danger,
  },
});

/* ── Pantalla principal ── */
export default function AuthScreen({ initialMode = 'login' }: { initialMode?: AuthMode }) {
  const router = useRouter();
  const { refreshAccess } = useAccess();
  const params = useLocalSearchParams<{ force?: string }>();
  const forceLoginView = params.force === '1';
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
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetMessage, setResetMessage]     = useState('');

  const confirmAnim  = useRef(new Animated.Value(0)).current;
  const passwordAnim = useRef(new Animated.Value(0)).current;
  const nameAnim     = useRef(new Animated.Value(0)).current;

  const isLogin      = mode === 'login';
  const emailIsValid = EMAIL_REGEX.test(email.trim().toLowerCase());

  /* Verificar sesión activa al montar */
  useEffect(() => {
    getSession()
      .then(async (result) => {
        const confirmed = (result?.session?.user as any)?.email_confirmed_at;
        if (confirmed && !forceLoginView) {
          if (result?.session?.access_token) {
            await saveToken(result.session.access_token);
          }
          await refreshAccess();
          router.replace('/(tabs)');
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [forceLoginView, refreshAccess, router]);

  const handleGuest = async () => {
    try {
      await signOut();
    } catch {
      // Guest mode should still work if remote sign-out cannot complete.
    }
    await clearToken();
    await refreshAccess();
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
        await refreshAccess();
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

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    setResetMessage('');

    if (!trimmedEmail) {
      setErrors({ email: 'Ingresa tu correo para enviarte el codigo.' });
      return;
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setErrors({ email: 'El formato del correo no es valido.' });
      return;
    }

    setIsSendingReset(true);
    try {
      await requestPasswordReset(trimmedEmail);
      setErrors({});
      setResetMessage('Te enviamos un codigo para cambiar tu contrasena. Revisa tu correo.');
      router.push(`/reset-password?email=${encodeURIComponent(trimmedEmail)}` as any);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo enviar el codigo.';
      setErrors({ email: msg });
    } finally {
      setIsSendingReset(false);
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
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
        <Image source={LOGO} style={styles.splashLogo} resizeMode="contain" accessibilityLabel="CliMax" />
        <Text style={styles.splashTitle}>CliMax</Text>
        <ActivityIndicator color={premiumColors.accent} style={{ marginTop: 20 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <AuthWeatherBubbles />

      {/* Velado muy suave (las burbujas llevan el protagonismo) */}
      <View style={styles.bgGlow1} />
      <View style={styles.bgGlow2} />

      <GaruaRainOverlay />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Wrapper de sombra */}
        <PremiumReveal style={styles.cardShadow}>
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

              <View style={styles.valuePills}>
                <View style={styles.valuePill}>
                  <Ionicons name="sparkles" size={13} color={premiumColors.accent} />
                  <Text style={styles.valuePillText}>Alertas IA</Text>
                </View>
                <View style={styles.valuePill}>
                  <Ionicons name="location" size={13} color={premiumColors.accent} />
                  <Text style={styles.valuePillText}>Clima local</Text>
                </View>
                <View style={styles.valuePill}>
                  <Ionicons name="shield-checkmark" size={13} color={premiumColors.accent} />
                  <Text style={styles.valuePillText}>Prevención</Text>
                </View>
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

                {isLogin ? (
                  <View style={styles.forgotWrap}>
                    <Pressable
                      onPress={handleForgotPassword}
                      disabled={isSendingReset}
                      style={({ pressed }) => [styles.forgotBtn, pressed && { opacity: 0.72 }]}
                    >
                      {isSendingReset ? (
                        <ActivityIndicator size="small" color={premiumColors.accent} />
                      ) : (
                        <Text style={styles.forgotText}>Olvidaste tu contrasena?</Text>
                      )}
                    </Pressable>
                    {resetMessage ? <Text style={styles.resetMessage}>{resetMessage}</Text> : null}
                  </View>
                ) : null}

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
                {isSubmitting && <ActivityIndicator size="small" color={premiumColors.accentDeep} style={{ marginRight: 8 }} />}
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
        </PremiumReveal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  /* ── Splash ── */
  splash: {
    flex: 1,
    backgroundColor: premiumColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  splashLogo: { width: 112, height: 112, borderRadius: 24 },
  splashTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: premiumColors.ink,
    letterSpacing: -0.5,
  },

  /* ── Pantalla principal ── */
  container: {
    flex: 1,
    backgroundColor: premiumColors.surface,
  },

  /* Destellos de fondo */
  bgGlow1: {
    position: 'absolute',
    top: -120,
    left: -100,
    width: 400,
    height: 400,
    borderRadius: 999,
    backgroundColor: premiumColors.auroraAqua,
    zIndex: 0,
    pointerEvents: 'none',
  },
  bgGlow2: {
    position: 'absolute',
    bottom: -80,
    right: -80,
    width: 300,
    height: 300,
    borderRadius: 999,
    backgroundColor: premiumColors.auroraTeal,
    zIndex: 0,
    pointerEvents: 'none',
  },

  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 56,
    zIndex: 2,
  },

  /* Card */
  cardShadow: {
    borderRadius: premiumRadii.xxl,
    ...premiumShadow('strong'),
  },
  blurCard: {
    borderRadius: premiumRadii.xxl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(226,98,43,0.28)',
    backgroundColor: 'rgba(255,255,255,0.92)',
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
    color: premiumColors.ink,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subheading: {
    color: premiumColors.inkMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },

  /* Fields */
  fields: { gap: 16 },
  forgotWrap: {
    alignItems: 'flex-end',
    gap: 7,
    marginTop: -8,
  },
  forgotBtn: {
    minHeight: 28,
    justifyContent: 'center',
  },
  forgotText: {
    color: premiumColors.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  resetMessage: {
    color: premiumColors.success,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'right',
  },

  valuePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: -4,
  },
  valuePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: premiumRadii.pill,
    backgroundColor: 'rgba(226,98,43,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(226,98,43,0.24)',
  },
  valuePillText: {
    color: premiumColors.inkMuted,
    fontSize: 11,
    fontWeight: '700',
  },

  /* Botón submit */
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: premiumColors.accent,
    borderRadius: premiumRadii.lg,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  submitBtnPressed: { backgroundColor: '#c94f1f' },
  submitBtnDisabled: { backgroundColor: 'rgba(27,32,39,0.15)' },
  submitBtnText: {
    color: premiumColors.accentDeep,
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
    backgroundColor: 'rgba(27,32,39,0.12)',
  },
  dividerText: {
    color: 'rgba(148,163,184,0.6)',
    fontSize: 13,
  },

  /* Toggle modo */
  toggleMode: { alignItems: 'center', paddingVertical: 4 },
  toggleModeGray: { color: 'rgba(148,163,184,0.85)', fontSize: 15 },
  toggleModeBlue: { color: premiumColors.accent, fontSize: 15, fontWeight: '700' },

  /* Invitado */
  guestBtn: { alignItems: 'center', paddingVertical: 4 },
  guestText: { color: 'rgba(148,163,184,0.5)', fontSize: 13 },
});
