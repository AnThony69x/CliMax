import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { getWeatherScene, WEATHER_SCENES } from '../../theme/weatherScenes';
import { WeatherParticles } from './WeatherParticles';

/**
 * Fondo "vivo" de una pantalla de clima: el gradiente de cielo y la capa de
 * partículas cambian según weatherCode + si es de día o de noche. Las
 * tarjetas de cristal se colocan encima y su blur recoge esta escena, por
 * eso el vidrio nunca tiene un color de marca fijo — hereda el del cielo.
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
  const sceneKey = getWeatherScene(code, isNight);
  const scene = WEATHER_SCENES[sceneKey];

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <LinearGradient
        colors={scene.sky}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[styles.glow, { backgroundColor: scene.glow }]} />
      {particlesEnabled ? <WeatherParticles kind={scene.particles} /> : null}
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
