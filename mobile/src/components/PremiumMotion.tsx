import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';

type PremiumRevealProps = {
  children: ReactNode;
  delay?: number;
  distance?: number;
  style?: ViewStyle | ViewStyle[];
};

export function PremiumReveal({
  children,
  delay = 0,
  distance = 14,
  style,
}: PremiumRevealProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(distance)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 520,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 620,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, opacity, translateY]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
