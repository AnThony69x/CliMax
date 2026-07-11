import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { getRainIntensity, getWeatherScene, WEATHER_SCENES } from '../../theme/weatherScenes';
import { WeatherParticles } from './WeatherParticles';

/** Fondo neutro mientras no hay dato de clima aún — nada de "atardecer" por defecto. */
const NEUTRAL_SKY: [string, string, string] = ['#f6f5f0', '#efeee7', '#e5e2d8'];

/**
 * Fondo "vivo" de una pantalla de clima: el gradiente de cielo y la capa de
 * partículas cambian según weatherCode + si es de día o de noche. Las
 * tarjetas de cristal se colocan encima y su blur recoge esta escena, por
 * eso el vidrio nunca tiene un color de marca fijo — hereda el del cielo.
 *
 * Al abrir la app aún no se conoce el código de clima (`code === undefined`):
 * en vez de asumir "despejado" (naranja/atardecer o azul noche), se muestra
 * un fondo neutro claro y, en cuanto llega el primer dato real, la escena
 * verdadera aparece con un fundido suave — sin flash de color equivocado.
 */
export function WeatherSceneBackground({
  code,
  isNight,
  particlesEnabled = true,
}: {
  code: number | undefined;
  isNight: boolean;
  particlesEnabled?: boolean;
}) {
  const hasData = code !== undefined;
  const sceneKey = getWeatherScene(code, isNight);
  const scene = WEATHER_SCENES[sceneKey];

  const revealAnim = useRef(new Animated.Value(hasData ? 1 : 0)).current;

  useEffect(() => {
    if (!hasData) return;
    Animated.timing(revealAnim, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    }).start();
  }, [hasData, revealAnim]);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <LinearGradient
        colors={NEUTRAL_SKY}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: revealAnim }]}>
        <LinearGradient
          colors={scene.sky}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.glow, { backgroundColor: scene.glow }]} />
        {particlesEnabled ? (
          <WeatherParticles kind={scene.particles} rainIntensity={getRainIntensity(code)} />
        ) : null}
      </Animated.View>
      <LinearGradient
        colors={['rgba(0,0,0,0.32)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.34)']}
        locations={[0, 0.22, 0.78, 1]}
        style={StyleSheet.absoluteFillObject}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    top: -60,
    right: -100,
    width: 320,
    height: 320,
    borderRadius: 999,
  },
});

export default WeatherSceneBackground;
