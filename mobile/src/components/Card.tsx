import { ReactNode } from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { premiumColors, premiumRadii, premiumShadow } from '../theme/premium';

type CardProps = {
  children: ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  variant?: 'default' | 'elevated' | 'outlined';
};

export function Card({ children, style, onPress, variant = 'default' }: CardProps) {
  const cardStyle = [
    styles.card,
    variant === 'elevated' && styles.elevated,
    variant === 'outlined' && styles.outlined,
    style,
  ];

  if (onPress) {
    return (
      <Pressable style={({ pressed }) => [cardStyle, pressed && styles.pressed]} onPress={onPress}>
        {children}
      </Pressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: premiumColors.surfaceElevated,
    borderRadius: premiumRadii.xl,
    borderWidth: 1,
    borderColor: premiumColors.glassBorder,
    padding: 18,
    overflow: 'hidden',
  },
  elevated: {
    ...premiumShadow('medium'),
  },
  outlined: {
    borderWidth: 1,
    borderColor: premiumColors.glassBorderStrong,
    backgroundColor: premiumColors.glass,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
});
