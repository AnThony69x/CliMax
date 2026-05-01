import { ReactNode } from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';

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
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  elevated: {
    shadowColor: '#0B1411',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  outlined: {
    borderWidth: 1,
    borderColor: '#D6DED9',
  },
  pressed: {
    opacity: 0.85,
  },
});