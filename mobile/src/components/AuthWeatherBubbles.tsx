import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';

type BubbleSpec = {
  icon: keyof typeof Ionicons.glyphMap;
  diameter: number;
  iconColor: string;
  glow: string;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  driftDelay: number;
};

/**
 * Fondo decorativo para login/registro: burbujas flotantes con iconos de clima.
 */
export function AuthWeatherBubbles() {
  const { width: W, height: H } = useWindowDimensions();

  const specs = useMemo<BubbleSpec[]>(
    () => [
      {
        icon: 'sunny-outline',
        diameter: 58,
        iconColor: '#fbbf24',
        glow: 'rgba(251, 191, 36, 0.45)',
        top: H * 0.07,
        left: W * 0.05,
        driftDelay: 0,
      },
      {
        icon: 'water-outline',
        diameter: 34,
        iconColor: '#2dd4bf',
        glow: 'rgba(45, 212, 191, 0.35)',
        top: H * 0.05,
        right: W * 0.08,
        driftDelay: 400,
      },
      {
        icon: 'cloud-outline',
        diameter: 68,
        iconColor: '#38bdf8',
        glow: 'rgba(56, 189, 248, 0.4)',
        top: H * 0.22,
        right: W * 0.02,
        driftDelay: 200,
      },
      {
        icon: 'rainy-outline',
        diameter: 46,
        iconColor: '#22d3ee',
        glow: 'rgba(34, 211, 238, 0.38)',
        top: H * 0.42,
        right: W * 0.06,
        driftDelay: 700,
      },
      {
        icon: 'flash-outline',
        diameter: 52,
        iconColor: '#a78bfa',
        glow: 'rgba(167, 139, 250, 0.42)',
        bottom: H * 0.28,
        left: W * 0.04,
        driftDelay: 300,
      },
      {
        icon: 'snow-outline',
        diameter: 40,
        iconColor: '#e0f2fe',
        glow: 'rgba(224, 242, 254, 0.35)',
        bottom: H * 0.14,
        left: W * 0.12,
        driftDelay: 550,
      },
      {
        icon: 'moon-outline',
        diameter: 44,
        iconColor: '#fde68a',
        glow: 'rgba(253, 230, 138, 0.4)',
        bottom: H * 0.1,
        right: W * 0.1,
        driftDelay: 150,
      },
      {
        icon: 'partly-sunny-outline',
        diameter: 36,
        iconColor: '#fb923c',
        glow: 'rgba(251, 146, 60, 0.38)',
        top: H * 0.34,
        left: W * 0.02,
        driftDelay: 600,
      },
    ],
    [W, H]
  );

  return (
    <View style={styles.layer}>
      {specs.map((spec, index) => (
        <WeatherBubble key={`${String(spec.icon)}-${index}`} spec={spec} animIndex={index} />
      ))}
    </View>
  );
}

function WeatherBubble({ spec, animIndex }: { spec: BubbleSpec; animIndex: number }) {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const duration = 2600 + (animIndex % 5) * 180;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const timer = setTimeout(() => loop.start(), spec.driftDelay);

    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [drift, spec.driftDelay, animIndex]);

  const translateY = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -11],
  });

  const { diameter, icon: iconName, iconColor, glow } = spec;
  const iconSize = Math.round(diameter * 0.42);

  const positionStyle = {
    position: 'absolute' as const,
    width: diameter + 14,
    height: diameter + 14,
    top: spec.top,
    left: spec.left,
    right: spec.right,
    bottom: spec.bottom,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  const outer = diameter + 12;

  return (
    <Animated.View style={[positionStyle, { transform: [{ translateY }] }]}>
      <View
        style={[
          styles.ring,
          {
            width: outer,
            height: outer,
            borderRadius: outer / 2,
            borderColor: glow,
          },
        ]}
      />
      <View
        style={[
          styles.bubble,
          {
            position: 'absolute',
            width: diameter,
            height: diameter,
            borderRadius: diameter / 2,
          },
        ]}
      >
        <Ionicons name={iconName} size={iconSize} color={iconColor} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(27,32,39,0.1)',
  },
});
