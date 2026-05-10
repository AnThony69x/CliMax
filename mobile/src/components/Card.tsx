import { ReactNode } from 'react';
import { Pressable, Platform, StyleSheet, View, ViewStyle } from 'react-native';

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
    ...Platform.select<ViewStyle>({
      web: {
        boxShadow: '0px 4px 18px rgba(11, 20, 17, 0.08)',
      },
      ios: {
        shadowColor: '#0B1411',
        shadowOpacity: 0.08,
        shadowRadius: 18,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  outlined: {
    borderWidth: 1,
    borderColor: '#D6DED9',
  },
  pressed: {
    opacity: 0.85,
  },
});