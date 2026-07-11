import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import {
  premiumColors,
  premiumRadii,
  premiumShadow,
  premiumSpacing,
} from '../theme/premium';

const appIcon = require('../../assets/images/icon.png');

export function AppBootSplash() {
  const glow = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    const liftIn = Animated.timing(lift, {
      toValue: 1,
      duration: 820,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    const sweepLoop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 2100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1300,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    glowLoop.start();
    liftIn.start();
    sweepLoop.start();
    shimmerLoop.start();

    return () => {
      glowLoop.stop();
      liftIn.stop();
      sweepLoop.stop();
      shimmerLoop.stop();
    };
  }, [glow, lift, shimmer, sweep]);

  const glowScale = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.08],
  });
  const glowOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.72],
  });
  const liftTranslate = lift.interpolate({
    inputRange: [0, 1],
    outputRange: [22, 0],
  });
  const liftOpacity = lift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const sweepTranslate = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-90, 90],
  });
  const shimmerOpacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 1],
  });

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <View style={[styles.aurora, styles.auroraTop]} />
      <View style={[styles.aurora, styles.auroraBottom]} />
      <View style={styles.rainField}>
        {Array.from({ length: 18 }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.rainDrop,
              {
                left: `${(index * 19) % 100}%`,
                top: `${(index * 37) % 84}%`,
                opacity: index % 3 === 0 ? 0.42 : 0.22,
              },
            ]}
          />
        ))}
      </View>

      <Animated.View
        style={[
          styles.content,
          {
            opacity: liftOpacity,
            transform: [{ translateY: liftTranslate }],
          },
        ]}
      >
        <View style={styles.logoWrap}>
          <Animated.View
            style={[
              styles.logoGlow,
              {
                opacity: glowOpacity,
                transform: [{ scale: glowScale }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.orbit,
              {
                opacity: shimmerOpacity,
                transform: [{ translateX: sweepTranslate }],
              },
            ]}
          />
          <View style={styles.logoCard}>
            <Image source={appIcon} style={styles.logo} />
          </View>
        </View>

        <Text style={styles.eyebrow}>CLIMA EN TIEMPO REAL</Text>
        <Text style={styles.title}>CliMax</Text>
        <Text style={styles.subtitle}>Preparando tu pronostico premium</Text>

        <View style={styles.loadingPill}>
          <Animated.View
            style={[
              styles.loadingShine,
              {
                opacity: shimmerOpacity,
                transform: [{ translateX: sweepTranslate }],
              },
            ]}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: premiumColors.surface,
    justifyContent: 'center',
    overflow: 'hidden',
    zIndex: 999,
  },
  aurora: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
  },
  auroraTop: {
    top: -110,
    right: -120,
    backgroundColor: premiumColors.auroraAqua,
  },
  auroraBottom: {
    bottom: -130,
    left: -125,
    backgroundColor: premiumColors.auroraTeal,
  },
  rainField: {
    ...StyleSheet.absoluteFillObject,
  },
  rainDrop: {
    position: 'absolute',
    width: 1,
    height: 34,
    borderRadius: 1,
    backgroundColor: 'rgba(31,111,107,0.32)',
    transform: [{ rotate: '18deg' }],
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: premiumSpacing.xl,
  },
  logoWrap: {
    width: 142,
    height: 142,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: premiumSpacing.xl,
  },
  logoGlow: {
    position: 'absolute',
    width: 142,
    height: 142,
    borderRadius: 71,
    backgroundColor: 'rgba(226,98,43,0.28)',
  },
  orbit: {
    position: 'absolute',
    width: 76,
    height: 2,
    borderRadius: premiumRadii.pill,
    backgroundColor: 'rgba(226,98,43,0.65)',
  },
  logoCard: {
    width: 96,
    height: 96,
    borderRadius: 26,
    overflow: 'hidden',
    ...premiumShadow('strong'),
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  eyebrow: {
    color: premiumColors.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.7,
    marginBottom: premiumSpacing.sm,
  },
  title: {
    color: premiumColors.ink,
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1.4,
  },
  subtitle: {
    color: premiumColors.inkMuted,
    fontSize: 14,
    fontWeight: '700',
    marginTop: premiumSpacing.xs,
  },
  loadingPill: {
    width: 172,
    height: 6,
    borderRadius: premiumRadii.pill,
    backgroundColor: 'rgba(27,32,39,0.1)',
    marginTop: premiumSpacing.xl,
    overflow: 'hidden',
  },
  loadingShine: {
    width: 82,
    height: 6,
    borderRadius: premiumRadii.pill,
    backgroundColor: premiumColors.accent,
  },
});
