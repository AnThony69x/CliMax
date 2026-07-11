import { useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { ParticleKind, RainIntensity } from '../../theme/weatherScenes';

const { width: SCREEN_W } = Dimensions.get('window');

/**
 * Capas de partículas animadas por tipo de clima (sin emojis, sin imágenes
 * externas): lluvia, nieve, tormenta con relámpago, estrellas, nubes a la
 * deriva y rayos de sol. Viven detrás de las tarjetas de cristal para que el
 * blur las recoja y se sientan "a través" del vidrio.
 *
 * Todo corre sobre react-native-reanimated (worklets en el hilo de UI), igual
 * que el tab bar líquido: mismo número de capas que antes, pero la animación
 * no compite con el hilo de JS aunque haya varias pantallas con partículas
 * activas a la vez.
 */

function useLoop(duration: number, delay = 0, easing = Easing.linear) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing }), -1, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return progress;
}

function RainDrop({
  left,
  delay,
  duration,
  height,
  swayDeg,
  opacity,
  glint,
}: {
  left: number;
  delay: number;
  duration: number;
  height: number;
  swayDeg: number;
  opacity: number;
  glint?: boolean;
}) {
  const progress = useLoop(duration, delay);
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const translateY = -40 + t * 820;
    const translateX = Math.sin(t * Math.PI) * (swayDeg * 0.6);
    return {
      transform: [{ translateY }, { translateX }, { rotate: `${swayDeg}deg` }],
      opacity: glint ? opacity * (0.5 + 0.5 * Math.sin(t * Math.PI * 3)) : opacity,
    };
  });
  return (
    <Animated.View
      style={[
        styles.rainDrop,
        glint && styles.rainDropGlint,
        { left: `${left}%` as `${number}%`, height },
        style,
      ]}
    />
  );
}

function RainParticles({ intensity = 'moderate' }: { intensity?: RainIntensity }) {
  const count = intensity === 'light' ? 12 : intensity === 'heavy' ? 26 : 18;
  const swayDeg = intensity === 'light' ? 18 : intensity === 'heavy' ? 8 : 12;
  const baseDuration = intensity === 'light' ? 1150 : intensity === 'heavy' ? 480 : 780;
  const baseOpacity = intensity === 'light' ? 0.28 : intensity === 'heavy' ? 0.55 : 0.4;

  const drops = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: 4 + ((i * 97) % 100),
        delay: (i % 7) * 150,
        duration: baseDuration + (i % 5) * 120,
        height: (intensity === 'heavy' ? 26 : intensity === 'light' ? 12 : 18) + (i % 4) * 9,
        glint: i % 9 === 0,
      })),
    [count, baseDuration, intensity]
  );

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {drops.map((drop) => (
        <RainDrop
          key={drop.id}
          left={drop.left}
          delay={drop.delay}
          duration={drop.duration}
          height={drop.height}
          swayDeg={swayDeg}
          opacity={baseOpacity}
          glint={drop.glint}
        />
      ))}
    </View>
  );
}

function LightningFlash() {
  const flash = useSharedValue(0);

  useEffect(() => {
    const scheduleNext = (): void => {
      const wait = 3200 + Math.random() * 3800;
      flash.value = withDelay(
        wait,
        withSequence(
          withTiming(1, { duration: 70 }),
          withTiming(0.12, { duration: 90 }),
          withTiming(0.65, { duration: 60 }),
          withTiming(0, { duration: 260 })
        )
      );
    };
    scheduleNext();
    const id = setInterval(scheduleNext, 7200);
    return () => clearInterval(id);
  }, [flash]);

  const style = useAnimatedStyle(() => ({ opacity: flash.value }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.6 }));

  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.lightningGlow, glowStyle]} />
      <Animated.View pointerEvents="none" style={[styles.lightning, style]} />
    </>
  );
}

function SnowFlake({
  left,
  size,
  delay,
  duration,
  drift,
}: {
  left: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
}) {
  const progress = useLoop(duration, delay);
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const translateY = -20 + t * 800;
    const translateX = Math.sin(t * Math.PI * 2) * drift;
    const rotate = `${t * 300}deg`;
    return { transform: [{ translateY }, { translateX }, { rotate }] };
  });
  return (
    <Animated.View
      style={[
        styles.snowFlake,
        { left: `${left}%` as `${number}%`, width: size, height: size, borderRadius: size },
        style,
      ]}
    />
  );
}

function SnowParticles() {
  const flakes = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        id: i,
        left: 3 + ((i * 43) % 100),
        size: 3 + (i % 3) * 2,
        delay: (i % 8) * 330,
        duration: 4200 + (i % 6) * 700,
        drift: (i % 2 === 0 ? 1 : -1) * (10 + (i % 3) * 8),
      })),
    []
  );

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {flakes.map((flake) => (
        <SnowFlake key={flake.id} {...flake} />
      ))}
    </View>
  );
}

function Star({
  left,
  top,
  size,
  delay,
  duration,
}: {
  left: number;
  top: number;
  size: number;
  delay: number;
  duration: number;
}) {
  const progress = useSharedValue(0.3);
  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.25, { duration, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        true
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.75 + progress.value * 0.4 }],
  }));
  return (
    <Animated.View
      style={[
        styles.star,
        { left: `${left}%` as `${number}%`, top: `${top}%` as `${number}%`, width: size, height: size, borderRadius: size },
        style,
      ]}
    />
  );
}

function StarsField() {
  const stars = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        id: i,
        left: 5 + ((i * 61) % 94),
        top: 4 + ((i * 37) % 55),
        size: 1.4 + (i % 3) * 0.7,
        delay: (i % 6) * 400,
        duration: 2400 + (i % 5) * 500,
      })),
    []
  );

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {stars.map((star) => (
        <Star key={star.id} {...star} />
      ))}
    </View>
  );
}

function CloudBlob({
  top,
  size,
  opacity,
  duration,
  from,
  to,
  shadow,
}: {
  top: number;
  size: number;
  opacity: number;
  duration: number;
  from: number;
  to: number;
  shadow?: boolean;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const translateX = (from + t * (to - from)) * SCREEN_W;
    const bob = Math.sin(t * Math.PI) * 4;
    return {
      transform: [{ translateX }, { translateY: bob }],
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: `${top}%` as `${number}%`,
          width: size,
          height: size * 0.42,
          borderRadius: size,
          opacity,
          backgroundColor: shadow ? 'rgba(15,23,42,0.16)' : 'rgba(226,232,240,0.5)',
        },
        style,
      ]}
    />
  );
}

function CloudsDrift({ dense }: { dense?: boolean }) {
  const blobs = useMemo(
    () => [
      { id: 0, top: 9, size: 220, opacity: dense ? 0.5 : 0.32, duration: 26000, from: -0.25, to: 0.15 },
      { id: 1, top: 29, size: 180, opacity: dense ? 0.4 : 0.24, duration: 34000, from: 0.2, to: -0.2 },
      { id: 2, top: 49, size: 150, opacity: dense ? 0.32 : 0.18, duration: 30000, from: -0.15, to: 0.1 },
    ],
    [dense]
  );

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {blobs.map((blob) => (
        <View key={blob.id}>
          <CloudBlob {...blob} top={blob.top + 5} shadow />
          <CloudBlob {...blob} />
        </View>
      ))}
    </View>
  );
}

function SunRays() {
  const spin = useSharedValue(0);
  const breathe = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 60000, easing: Easing.linear }), -1, false);
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2600, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.7 + breathe.value * 0.3,
    transform: [{ scale: 1 + breathe.value * 0.06 }],
  }));

  return (
    <View style={styles.sunRaysWrap} pointerEvents="none">
      <Animated.View style={[styles.sunRaysRing, ringStyle, glowStyle]}>
        {Array.from({ length: 8 }, (_, i) => (
          <View key={i} style={[styles.sunRay, { transform: [{ rotate: `${(360 / 8) * i}deg` }] }]} />
        ))}
      </Animated.View>
    </View>
  );
}

function FogBand({ top, opacity, duration, from, to }: { top: string; opacity: number; duration: number; from: number; to: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const translateX = (from + t * (to - from)) * SCREEN_W;
    return { transform: [{ translateX }] };
  });
  return <Animated.View style={[styles.fogBand, { top: top as any, opacity }, style]} />;
}

function FogHaze() {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <FogBand top="20%" opacity={0.3} duration={22000} from={-0.12} to={0.08} />
      <FogBand top="42%" opacity={0.22} duration={28000} from={0.1} to={-0.1} />
      <FogBand top="64%" opacity={0.28} duration={25000} from={-0.08} to={0.12} />
    </View>
  );
}

export function WeatherParticles({ kind, rainIntensity }: { kind: ParticleKind; rainIntensity?: RainIntensity }) {
  switch (kind) {
    case 'rain':
      return <RainParticles intensity={rainIntensity} />;
    case 'storm':
      return (
        <>
          <RainParticles intensity="heavy" />
          <LightningFlash />
        </>
      );
    case 'snow':
      return <SnowParticles />;
    case 'stars':
      return <StarsField />;
    case 'clouds':
      return <CloudsDrift />;
    case 'fog':
      return <FogHaze />;
    case 'rays':
      return <SunRays />;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  rainDrop: {
    position: 'absolute',
    top: 0,
    width: 2,
    backgroundColor: '#cfe3ff',
    borderRadius: 999,
  },
  rainDropGlint: {
    width: 2.4,
    backgroundColor: '#eef6ff',
  },
  snowFlake: {
    position: 'absolute',
    top: 0,
    backgroundColor: '#ffffff',
  },
  star: {
    position: 'absolute',
    backgroundColor: '#ffffff',
  },
  lightning: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#e9e4ff',
  },
  lightningGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#c4b5fd',
  },
  sunRaysWrap: {
    position: 'absolute',
    top: '4%',
    left: '50%',
    marginLeft: -170,
    width: 340,
    height: 340,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunRaysRing: {
    width: 340,
    height: 340,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunRay: {
    position: 'absolute',
    width: 3,
    height: 170,
    borderRadius: 3,
    backgroundColor: 'rgba(255,236,190,0.22)',
  },
  fogBand: {
    position: 'absolute',
    left: -40,
    right: -40,
    height: 60,
    backgroundColor: 'rgba(210,225,220,0.5)',
    borderRadius: 999,
  },
});

export default WeatherParticles;
