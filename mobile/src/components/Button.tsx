import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type TextStyle, ViewStyle } from 'react-native';
import { premiumColors, premiumRadii, premiumShadow } from '../theme/premium';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
type ButtonSize = 'small' | 'medium' | 'large';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  icon,
  style,
}: ButtonProps) {
  const variantTextStyle = styles[`${variant}Text` as `${ButtonVariant}Text`] as TextStyle;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        styles[size],
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <Text style={[styles.text, variantTextStyle]}>
          Cargando...
        </Text>
      ) : (
        <>
          {icon}
          <Text style={[styles.text, variantTextStyle]}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: premiumRadii.lg,
    gap: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  primary: {
    backgroundColor: premiumColors.accent,
    borderColor: 'rgba(255,255,255,0.28)',
    ...premiumShadow('soft'),
  },
  secondary: {
    backgroundColor: premiumColors.glassStrong,
    borderColor: premiumColors.glassBorder,
  },
  outline: {
    backgroundColor: 'transparent',
    borderColor: premiumColors.glassBorderStrong,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  small: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  medium: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  large: {
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
  },
  primaryText: {
    color: premiumColors.accentDeep,
    fontWeight: '800',
  },
  secondaryText: {
    color: premiumColors.ink,
  },
  outlineText: {
    color: premiumColors.accentSoft,
  },
  ghostText: {
    color: premiumColors.accentSoft,
  },
});
