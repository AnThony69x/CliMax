import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { getSession, updatePassword, verifyRecoveryCodeAndUpdatePassword } from '../../core/auth/supabaseClient';
import { premiumColors, premiumRadii, premiumShadow } from '../../theme/premium';

const LOGO = require('../../../assets/images/icon.png');

type FieldErrors = {
  email?: string;
  code?: string;
  password?: string;
  confirmPassword?: string;
  general?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; fromLink?: string }>();
  const initialEmail = typeof params.email === 'string' ? params.email : '';
  const cameFromRecoveryLink = params.fromLink === '1';
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    getSession()
      .then((result) => {
        setHasRecoverySession(cameFromRecoveryLink && Boolean(result?.session?.access_token));
      })
      .catch(() => {
        setHasRecoverySession(false);
      })
      .finally(() => {
        setIsCheckingSession(false);
      });
  }, [cameFromRecoveryLink]);

  const validate = () => {
    const next: FieldErrors = {};
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedCode = code.trim();

    if (!hasRecoverySession) {
      if (!trimmedEmail) {
        next.email = 'Ingresa el correo de tu cuenta.';
      } else if (!EMAIL_REGEX.test(trimmedEmail)) {
        next.email = 'El formato del correo no es valido.';
      }

      if (!trimmedCode) {
        next.code = 'Ingresa el codigo que recibiste.';
      } else if (trimmedCode.length < 6) {
        next.code = 'El codigo debe tener al menos 6 caracteres.';
      }
    }

    if (!password) {
      next.password = 'Ingresa tu nueva contrasena.';
    } else if (password.length < 6) {
      next.password = 'La contrasena debe tener al menos 6 caracteres.';
    }

    if (!confirmPassword) {
      next.confirmPassword = 'Confirma tu nueva contrasena.';
    } else if (password !== confirmPassword) {
      next.confirmPassword = 'Las contrasenas no coinciden.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setIsSaving(true);
    setSuccessMessage('');
    try {
      if (hasRecoverySession) {
        await updatePassword(password);
      } else {
        await verifyRecoveryCodeAndUpdatePassword(email, code, password);
      }
      setPassword('');
      setConfirmPassword('');
      setCode('');
      setErrors({});
      setSuccessMessage('Contrasena actualizada. Ya puedes entrar con tu nueva clave.');
      setTimeout(() => {
        router.replace('/login?force=1');
      }, 900);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo actualizar la contrasena.';
      setErrors({ general: message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <AuthWeatherBubbles />
      <View style={styles.bgGlowTop} />
      <View style={styles.bgGlowBottom} />
      <GaruaRainOverlay />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PremiumReveal style={styles.cardShadow}>
          <View style={styles.card}>
            <View style={styles.logoWrap}>
              <Image source={LOGO} style={styles.logo} resizeMode="contain" />
            </View>

            <View style={styles.headingWrap}>
              <Text style={styles.eyebrow}>RECUPERACION SEGURA</Text>
              <Text style={styles.title}>Nueva contrasena</Text>
              <Text style={styles.subtitle}>
                {hasRecoverySession
                  ? 'Crea una clave nueva para volver a entrar a CliMax.'
                  : 'Ingresa el codigo de tu correo y crea una clave nueva.'}
              </Text>
            </View>

            <View style={styles.fields}>
              {!isCheckingSession && !hasRecoverySession ? (
                <>
                  <TextField
                    label="Correo electronico"
                    placeholder="tu@email.com"
                    value={email}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={(value) => {
                      setEmail(value);
                      setErrors((prev) => ({ ...prev, email: undefined, general: undefined }));
                    }}
                    error={errors.email}
                  />
                  <TextField
                    label="Codigo de recuperacion"
                    placeholder="6 digitos"
                    value={code}
                    keyboardType="number-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={8}
                    onChangeText={(value) => {
                      setCode(value.replace(/\s/g, ''));
                      setErrors((prev) => ({ ...prev, code: undefined, general: undefined }));
                    }}
                    error={errors.code}
                  />
                </>
              ) : null}
              <PasswordField
                label="Nueva contrasena"
                placeholder="Minimo 6 caracteres"
                value={password}
                isRevealed={showPassword}
                onToggle={() => setShowPassword((prev) => !prev)}
                onChangeText={(value) => {
                  setPassword(value);
                  setErrors((prev) => ({ ...prev, password: undefined, general: undefined }));
                }}
                error={errors.password}
              />
              <PasswordField
                label="Confirmar contrasena"
                placeholder="Repite tu nueva clave"
                value={confirmPassword}
                isRevealed={showConfirmPassword}
                onToggle={() => setShowConfirmPassword((prev) => !prev)}
                onChangeText={(value) => {
                  setConfirmPassword(value);
                  setErrors((prev) => ({ ...prev, confirmPassword: undefined, general: undefined }));
                }}
                error={errors.confirmPassword}
              />
            </View>

            {errors.general ? <Text style={styles.errorBox}>{errors.general}</Text> : null}
            {successMessage ? <Text style={styles.successBox}>{successMessage}</Text> : null}

            <Pressable
              onPress={handleSave}
              disabled={isSaving || isCheckingSession}
              style={({ pressed }) => [
                styles.submitBtn,
                pressed && !isSaving && styles.submitBtnPressed,
                (isSaving || isCheckingSession) && styles.submitBtnDisabled,
              ]}
            >
              {isSaving || isCheckingSession ? (
                <ActivityIndicator size="small" color={premiumColors.accentDeep} style={{ marginRight: 8 }} />
              ) : null}
              <Text style={styles.submitText}>
                {isCheckingSession ? 'Preparando...' : isSaving ? 'Actualizando...' : 'Guardar nueva contrasena'}
              </Text>
            </Pressable>

            <Pressable onPress={() => router.replace('/login?force=1')} style={styles.backBtn}>
              <Text style={styles.backText}>Volver al login</Text>
            </Pressable>
          </View>
        </PremiumReveal>
      </ScrollView>
    </View>
  );
}

function TextField({
  label,
  error,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  error?: string;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, error ? styles.inputRowError : undefined]}>
        <TextInput
          style={styles.input}
          placeholderTextColor="rgba(148,163,184,0.5)"
          {...props}
        />
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function PasswordField({
  label,
  error,
  isRevealed,
  onToggle,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  error?: string;
  isRevealed: boolean;
  onToggle: () => void;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, error ? styles.inputRowError : undefined]}>
        <TextInput
          style={styles.input}
          placeholderTextColor="rgba(148,163,184,0.5)"
          secureTextEntry={!isRevealed}
          autoCapitalize="none"
          autoCorrect={false}
          {...props}
        />
        <Pressable onPress={onToggle} hitSlop={8} style={styles.eyeBtn}>
          <Ionicons
            name={isRevealed ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color="rgba(148,163,184,0.74)"
          />
        </Pressable>
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: premiumColors.surface,
  },
  bgGlowTop: {
    position: 'absolute',
    top: -120,
    left: -100,
    width: 400,
    height: 400,
    borderRadius: 999,
    backgroundColor: premiumColors.auroraAqua,
  },
  bgGlowBottom: {
    position: 'absolute',
    bottom: -80,
    right: -80,
    width: 300,
    height: 300,
    borderRadius: 999,
    backgroundColor: premiumColors.auroraTeal,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 56,
    zIndex: 2,
  },
  cardShadow: {
    borderRadius: premiumRadii.xxl,
    ...premiumShadow('strong'),
  },
  card: {
    borderRadius: premiumRadii.xxl,
    borderWidth: 1,
    borderColor: 'rgba(226,98,43,0.28)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    overflow: 'hidden',
    padding: 28,
    gap: 20,
  },
  logoWrap: {
    alignItems: 'center',
  },
  logo: {
    width: 86,
    height: 86,
    borderRadius: 20,
  },
  headingWrap: {
    alignItems: 'center',
    gap: 7,
  },
  eyebrow: {
    color: premiumColors.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  title: {
    color: premiumColors.ink,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.7,
    textAlign: 'center',
  },
  subtitle: {
    color: premiumColors.inkMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  fields: {
    gap: 16,
  },
  label: {
    color: premiumColors.inkSubtle,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 6,
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
    color: premiumColors.ink,
    fontSize: 15,
    paddingVertical: 13,
  },
  eyeBtn: {
    padding: 4,
  },
  fieldError: {
    color: premiumColors.danger,
    fontSize: 12,
    marginTop: 5,
  },
  errorBox: {
    color: premiumColors.danger,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  successBox: {
    color: premiumColors.success,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: premiumColors.accent,
    borderRadius: premiumRadii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    paddingVertical: 16,
  },
  submitBtnPressed: {
    backgroundColor: '#c94f1f',
  },
  submitBtnDisabled: {
    backgroundColor: 'rgba(27,32,39,0.15)',
  },
  submitText: {
    color: premiumColors.accentDeep,
    fontSize: 16,
    fontWeight: '800',
  },
  backBtn: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  backText: {
    color: premiumColors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
});
