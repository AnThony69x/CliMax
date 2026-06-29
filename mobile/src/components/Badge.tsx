import { ReactNode } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { premiumColors, premiumRadii } from '../theme/premium';

type BadgeProps = {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  size?: 'small' | 'medium';
  style?: ViewStyle;
};

export function Badge({ children, variant = 'default', size = 'medium', style }: BadgeProps) {
  return (
    <View style={[styles.badge, styles[variant], styles[size], style]}>
      <Text style={[styles.text, styles[`${variant}Text` as keyof typeof styles]]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: premiumRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  small: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  medium: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  default: {
    backgroundColor: premiumColors.glass,
    borderColor: premiumColors.glassBorder,
  },
  success: {
    backgroundColor: 'rgba(52,211,153,0.12)',
    borderColor: 'rgba(52,211,153,0.35)',
  },
  warning: {
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderColor: 'rgba(251,191,36,0.38)',
  },
  error: {
    backgroundColor: 'rgba(251,113,133,0.12)',
    borderColor: 'rgba(251,113,133,0.38)',
  },
  info: {
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderColor: premiumColors.glassBorderStrong,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  defaultText: {
    color: premiumColors.inkMuted,
  },
  successText: {
    color: premiumColors.success,
  },
  warningText: {
    color: premiumColors.warning,
  },
  errorText: {
    color: premiumColors.danger,
  },
  infoText: {
    color: premiumColors.accentSoft,
  },
});
