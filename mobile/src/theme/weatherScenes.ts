/**
 * Escenas visuales por condición de clima.
 *
 * Cada weatherCode (Open-Meteo) se agrupa en una "escena": un cielo (gradiente),
 * un acento y una capa de partículas. El cristal (BlurView) no cambia de receta
 * entre escenas — solo la escena de fondo cambia, así el vidrio siempre se ve
 * "sobre" un clima real en vez de sobre un color de marca fijo.
 */

export type ParticleKind = 'rays' | 'clouds' | 'rain' | 'storm' | 'snow' | 'stars' | 'fog' | null;

export type WeatherSceneKey =
  | 'clear-day'
  | 'clear-night'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'rain'
  | 'storm'
  | 'snow';

export type SceneTokens = {
  /** Gradiente de cielo, de arriba a abajo. */
  sky: [string, string, string];
  /** Resplandor ambiental (glow) detrás del hero. */
  glow: string;
  /** Acento de la escena: usado en el "°", chips activos, indicadores. */
  accent: string;
  accentSoft: string;
  particles: ParticleKind;
};

export const WEATHER_SCENES: Record<WeatherSceneKey, SceneTokens> = {
  'clear-day': {
    sky: ['#ffdca8', '#ec8a58', '#7a3a56'],
    glow: 'rgba(255, 200, 120, 0.28)',
    accent: '#fbbf24',
    accentSoft: '#ffe3a6',
    particles: 'rays',
  },
  'clear-night': {
    sky: ['#171233', '#120c2b', '#050310'],
    glow: 'rgba(196, 181, 253, 0.22)',
    accent: '#c4b5fd',
    accentSoft: '#e9e2ff',
    particles: 'stars',
  },
  'partly-cloudy': {
    sky: ['#7d90ac', '#4b5b76', '#232c3d'],
    glow: 'rgba(148, 163, 184, 0.22)',
    accent: '#7dd3fc',
    accentSoft: '#bae6fd',
    particles: 'clouds',
  },
  cloudy: {
    sky: ['#5c6779', '#3b4353', '#1f2430'],
    glow: 'rgba(148, 163, 184, 0.16)',
    accent: '#94a3b8',
    accentSoft: '#cbd5e1',
    particles: 'clouds',
  },
  fog: {
    sky: ['#5b6b6a', '#3d4a4a', '#232b2b'],
    glow: 'rgba(163, 184, 176, 0.18)',
    accent: '#9cc7bf',
    accentSoft: '#d1e8e2',
    particles: 'fog',
  },
  // Marino: el vidrio flota sobre un azul noche profundo, no sobre el celeste
  // genérico de marca — es la condición donde el color SÍ debe leerse como "lluvia".
  rain: {
    sky: ['#0d1b33', '#122a4a', '#0a1526'],
    glow: 'rgba(78, 118, 181, 0.32)',
    accent: '#6ea8dc',
    accentSoft: '#a7c7ea',
    particles: 'rain',
  },
  storm: {
    sky: ['#241a3d', '#1c1433', '#0a0716'],
    glow: 'rgba(192, 132, 252, 0.22)',
    accent: '#c084fc',
    accentSoft: '#e9d5ff',
    particles: 'storm',
  },
  snow: {
    sky: ['#dbeeff', '#7f9db8', '#334155'],
    glow: 'rgba(224, 242, 254, 0.3)',
    accent: '#67e8f9',
    accentSoft: '#e0f2fe',
    particles: 'snow',
  },
};

const FOG_CODES = new Set([45, 48]);
const RAIN_CODES = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82]);
const STORM_CODES = new Set([95, 96, 99]);
const SNOW_CODES = new Set([71, 73, 75]);

export function isNightNow(sunrise?: string | null, sunset?: string | null): boolean {
  if (!sunrise || !sunset) {
    const hour = new Date().getHours();
    return hour < 5 || hour >= 19;
  }
  const now = Date.now();
  const sunriseMs = new Date(sunrise).getTime();
  const sunsetMs = new Date(sunset).getTime();
  if (Number.isNaN(sunriseMs) || Number.isNaN(sunsetMs)) return false;
  return now < sunriseMs || now >= sunsetMs;
}

export function getWeatherScene(code: number | undefined, isNight: boolean): WeatherSceneKey {
  if (code == null) return isNight ? 'clear-night' : 'clear-day';
  if (STORM_CODES.has(code)) return 'storm';
  if (SNOW_CODES.has(code)) return 'snow';
  if (RAIN_CODES.has(code)) return 'rain';
  if (FOG_CODES.has(code)) return 'fog';
  if (code === 3) return 'cloudy';
  if (code === 1 || code === 2) return 'partly-cloudy';
  return isNight ? 'clear-night' : 'clear-day';
}

export function sceneForCode(code: number | undefined, isNight: boolean): SceneTokens {
  return WEATHER_SCENES[getWeatherScene(code, isNight)];
}
