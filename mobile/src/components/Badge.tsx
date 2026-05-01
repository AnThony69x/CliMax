import { ReactNode } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

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
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: '#E8EBE9',
  },
  success: {
    backgroundColor: '#E5F4EC',
  },
  warning: {
    backgroundColor: '#FFF4E5',
  },
  error: {
    backgroundColor: '#FDEAEA',
  },
  info: {
    backgroundColor: '#E5F4FF',
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  defaultText: {
    color: '#52655A',
  },
  successText: {
    color: '#2A7A4B',
  },
  warningText: {
    color: '#B87506',
  },
  errorText: {
    color: '#A33A3A',
  },
  infoText: {
    color: '#0066CC',
  },
});