import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';

const DROP_COUNT = 52;

/** 0–1 pseudoaleatorio estable por índice */
function pseudoRandom(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 10000;
  return x - Math.floor(x);
}

type DropSpec = {
  left: number;
  delay: number;
  duration: number;
  length: number;
  opacity: number;
  driftX: number;
};

function RainStreak({
  spec,
  screenH,
}: {
  spec: DropSpec;
  screenH: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const travel = screenH + 72;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: spec.duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );

    const timer = setTimeout(() => {
      loop.start();
    }, spec.delay);

    return () => {
      clearTimeout(timer);
      loop.stop();
      progress.stopAnimation();
    };
  }, [progress, spec.delay, spec.duration]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-48, travel],
  });

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -spec.driftX],
  });

  return (
    <Animated.View
      style={[
        styles.streakWrap,
        {
          left: spec.left,
          opacity: spec.opacity,
          transform: [{ translateY }, { translateX }, { rotate: '14deg' }],
        },
      ]}
    >
      <View style={[styles.streak, { height: spec.length }]} />
    </Animated.View>
  );
}

/**
 * Llovizna tipo garúa: hilos finos, lentos y suaves sobre el fondo (login/registro).
 */
export function GaruaRainOverlay() {
  const { width: W, height: H } = useWindowDimensions();

  const drops = useMemo<DropSpec[]>(() => {
    return Array.from({ length: DROP_COUNT }, (_, i) => {
      const seed = i + 1;
      return {
        left: pseudoRandom(seed * 3) * (W + 24) - 12,
        delay: Math.floor(pseudoRandom(seed * 11) * 6500),
        duration: 4200 + Math.floor(pseudoRandom(seed * 17) * 5200),
        length: 6 + Math.floor(pseudoRandom(seed * 19) * 18),
        opacity: 0.06 + pseudoRandom(seed * 23) * 0.22,
        driftX: (pseudoRandom(seed * 29) - 0.45) * 22,
      };
    });
  }, [W]);

  return (
    <View style={styles.layer}>
      {drops.map((spec, i) => (
        <RainStreak key={i} spec={spec} screenH={H} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  streakWrap: {
    position: 'absolute',
    top: 0,
    width: 3,
    pointerEvents: 'none',
  },
  streak: {
    width: 1.5,
    borderRadius: 1,
    backgroundColor: 'rgba(186, 230, 253, 0.55)',
  },
});
