import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { ParticleKind } from '../../theme/weatherScenes';

/**
 * Capas de partículas animadas por tipo de clima (sin emojis, sin imágenes
 * externas): lluvia, nieve, tormenta con relámpago, estrellas, nubes a la
 * deriva y rayos de sol. Viven detrás de las tarjetas de cristal para que el
 * blur las recoja y se sientan "a través" del vidrio.
 */

function RainParticles({ heavy }: { heavy?: boolean }) {
  const count = heavy ? 26 : 18;
  const drops = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: (4 + (i * 97) % 100),
        delay: (i % 7) * 160,
        duration: (heavy ? 500 : 850) + (i % 5) * 140,
        height: (heavy ? 26 : 18) + (i % 4) * 10,
      })),
    [count, heavy]
  );
  const values = useMemo(() => drops.map(() => new Animated.Value(0)), [drops]);

  useEffect(() => {
    const loops = values.map((val, i) =>
      Animated.loop(
        Animated.timing(val, {
          toValue: 1,
          duration: drops[i].duration,
          delay: drops[i].delay,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      )
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [values, drops]);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {drops.map((drop, i) => (
        <Animated.View
          key={drop.id}
          style={[
            styles.rainDrop,
            {
              left: `${drop.left}%` as `${number}%`,
              height: drop.height,
              opacity: heavy ? 0.55 : 0.4,
              transform: [
                {
                  translateY: values[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [-40, 780],
                  }),
                },
                { rotate: '12deg' },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

function LightningFlash() {
  const flash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    const cycle = () => {
      if (cancelled) return;
      const wait = 3200 + Math.random() * 3800;
      const timer = setTimeout(() => {
        Animated.sequence([
          Animated.timing(flash, { toValue: 1, duration: 70, useNativeDriver: true }),
          Animated.timing(flash, { toValue: 0.15, duration: 90, useNativeDriver: true }),
          Animated.timing(flash, { toValue: 0.7, duration: 60, useNativeDriver: true }),
          Animated.timing(flash, { toValue: 0, duration: 220, useNativeDriver: true }),
        ]).start(() => cycle());
      }, wait);
      return timer;
    };
    const t = cycle();
    return () => {
      cancelled = true;
      if (t) clearTimeout(t);
    };
  }, [flash]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.lightning, { opacity: flash }]}
    />
  );
}

function SnowParticles() {
  const flakes = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        id: i,
        left: (3 + (i * 43) % 100),
        size: 3 + (i % 3) * 2,
        delay: (i % 8) * 340,
        duration: 4200 + (i % 6) * 700,
        drift: (i % 2 === 0 ? 1 : -1) * (10 + (i % 3) * 8),
      })),
    []
  );
  const values = useMemo(() => flakes.map(() => new Animated.Value(0)), [flakes]);

  useEffect(() => {
    const loops = values.map((val, i) =>
      Animated.loop(
        Animated.timing(val, {
          toValue: 1,
          duration: flakes[i].duration,
          delay: flakes[i].delay,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      )
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [values, flakes]);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {flakes.map((flake, i) => (
        <Animated.View
          key={flake.id}
          style={[
            styles.snowFlake,
            {
              left: `${flake.left}%` as `${number}%`,
              width: flake.size,
              height: flake.size,
              borderRadius: flake.size,
              transform: [
                {
                  translateY: values[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 780],
                  }),
                },
                {
                  translateX: values[i].interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, flake.drift, 0],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

function StarsField() {
  const stars = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        id: i,
        left: (5 + (i * 61) % 94),
        top: (4 + (i * 37) % 55),
        size: 1.4 + (i % 3) * 0.7,
        delay: (i % 6) * 420,
        duration: 2400 + (i % 5) * 500,
      })),
    []
  );
  const values = useMemo(() => stars.map((s) => new Animated.Value(0.3 + (s.id % 3) * 0.1)), [stars]);

  useEffect(() => {
    const loops = values.map((val, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, {
            toValue: 1,
            duration: stars[i].duration,
            delay: stars[i].delay,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0.25,
            duration: stars[i].duration,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      )
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [values, stars]);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {stars.map((star, i) => (
        <Animated.View
          key={star.id}
          style={[
            styles.star,
            {
              left: `${star.left}%` as `${number}%`,
              top: `${star.top}%` as `${number}%`,
              width: star.size,
              height: star.size,
              borderRadius: star.size,
              opacity: values[i],
            },
          ]}
        />
      ))}
    </View>
  );
}

function CloudsDrift({ dense }: { dense?: boolean }) {
  const blobs = useMemo(
    () => [
      { id: 0, top: '8%', size: 220, opacity: dense ? 0.5 : 0.32, duration: 26000, from: -0.25, to: 0.15 },
      { id: 1, top: '28%', size: 180, opacity: dense ? 0.4 : 0.24, duration: 34000, from: 0.2, to: -0.2 },
      { id: 2, top: '48%', size: 150, opacity: dense ? 0.32 : 0.18, duration: 30000, from: -0.15, to: 0.1 },
    ],
    [dense]
  );
  const values = useMemo(() => blobs.map(() => new Animated.Value(0)), [blobs]);

  useEffect(() => {
    const loops = values.map((val, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, {
            toValue: 1,
            duration: blobs[i].duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: blobs[i].duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      )
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [values, blobs]);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {blobs.map((blob, i) => (
        <Animated.View
          key={blob.id}
          style={{
            position: 'absolute',
            top: blob.top as any,
            width: blob.size,
            height: blob.size * 0.42,
            borderRadius: blob.size,
            opacity: blob.opacity,
            backgroundColor: 'rgba(226,232,240,0.5)',
            transform: [
              {
                translateX: values[i].interpolate({
                  inputRange: [0, 1],
                  outputRange: [`${blob.from * 100}%`, `${blob.to * 100}%`] as any,
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}

function SunRays() {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 60000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.sunRaysWrap} pointerEvents="none">
      <Animated.View style={[styles.sunRaysRing, { transform: [{ rotate }] }]}>
        {Array.from({ length: 8 }, (_, i) => (
          <View
            key={i}
            style={[
              styles.sunRay,
              { transform: [{ rotate: `${(360 / 8) * i}deg` }] },
            ]}
          />
        ))}
      </Animated.View>
    </View>
  );
}

function FogHaze() {
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <View style={[styles.fogBand, { top: '20%', opacity: 0.3 }]} />
      <View style={[styles.fogBand, { top: '42%', opacity: 0.22 }]} />
      <View style={[styles.fogBand, { top: '64%', opacity: 0.28 }]} />
    </View>
  );
}

export function WeatherParticles({ kind }: { kind: ParticleKind }) {
  switch (kind) {
    case 'rain':
      return <RainParticles />;
    case 'storm':
      return (
        <>
          <RainParticles heavy />
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
    left: -20,
    right: -20,
    height: 60,
    backgroundColor: 'rgba(210,225,220,0.5)',
    borderRadius: 999,
  },
});

export default WeatherParticles;
