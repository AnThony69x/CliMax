import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

/**
 * Textura de cráteres fija (posiciones relativas al radio) para que el
 * globo no se vea como un disco liso — sutil, no pretende ser un mapa real.
 */
const CRATERS: { cx: number; cy: number; r: number; o: number }[] = [
  { cx: 0.36, cy: 0.32, r: 0.09, o: 0.16 },
  { cx: 0.58, cy: 0.24, r: 0.05, o: 0.12 },
  { cx: 0.66, cy: 0.5, r: 0.1, o: 0.14 },
  { cx: 0.42, cy: 0.62, r: 0.06, o: 0.1 },
  { cx: 0.28, cy: 0.55, r: 0.04, o: 0.12 },
  { cx: 0.52, cy: 0.72, r: 0.07, o: 0.1 },
];

/**
 * Arco SVG con la forma exacta de la fase lunar (creciente/gibosa/menguante)
 * a partir de la fracción del ciclo sinódico: 0 = nueva, 0.5 = llena.
 * Técnica estándar: un semicírculo exterior + una elipse "terminador" cuyo
 * radio horizontal es r·cos(fase·2π); el signo decide de qué lado se curva.
 */
function litPath(r: number, phaseFraction: number): string {
  const theta = phaseFraction * Math.PI * 2;
  const rx = r * Math.cos(theta);
  const outerSweep = phaseFraction < 0.5 ? 1 : 0;
  const innerSweep = rx > 0 ? outerSweep : 1 - outerSweep;
  return [
    `M ${r},0`,
    `A ${Math.abs(rx)},${r} 0 0,${innerSweep} ${r},${r * 2}`,
    `A ${r},${r} 0 0,${outerSweep} ${r},0`,
    'Z',
  ].join(' ');
}

export function MoonPhaseGlobe({
  size = 68,
  phaseFraction,
}: {
  size?: number;
  phaseFraction: number;
}) {
  const r = size / 2;
  const path = litPath(r, phaseFraction);

  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  const haloOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });
  const haloScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  return (
    <View style={[styles.wrap, { width: size + 24, height: size + 24 }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          {
            width: size + 20,
            height: size + 20,
            borderRadius: (size + 20) / 2,
            opacity: haloOpacity,
            transform: [{ scale: haloScale }],
          },
        ]}
      />
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id="moonLit" cx="34%" cy="28%" r="80%">
            <Stop offset="0%" stopColor="#fffaf0" stopOpacity={1} />
            <Stop offset="55%" stopColor="#eee7d6" stopOpacity={1} />
            <Stop offset="100%" stopColor="#c9c0a6" stopOpacity={1} />
          </RadialGradient>
          <RadialGradient id="moonDark" cx="62%" cy="68%" r="85%">
            <Stop offset="0%" stopColor="#333a4d" stopOpacity={1} />
            <Stop offset="100%" stopColor="#0f1220" stopOpacity={1} />
          </RadialGradient>
          <ClipPath id="disc">
            <Circle cx={r} cy={r} r={r} />
          </ClipPath>
        </Defs>
        <G clipPath="url(#disc)">
          <Circle cx={r} cy={r} r={r} fill="url(#moonDark)" />
          <Path d={path} fill="url(#moonLit)" />
          {CRATERS.map((c, i) => (
            <Ellipse
              key={i}
              cx={c.cx * size}
              cy={c.cy * size}
              rx={c.r * size}
              ry={c.r * size * 0.85}
              fill="#5b5442"
              opacity={c.o}
            />
          ))}
        </G>
        <Circle
          cx={r}
          cy={r}
          r={r - 0.6}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={1}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    backgroundColor: 'rgba(255,247,224,0.28)',
  },
});

export default MoonPhaseGlobe;
