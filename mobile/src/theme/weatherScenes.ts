/**
 * Escenas visuales por condición de clima — dirección "Solsticio".
 *
 * Cada weatherCode (Open-Meteo) se agrupa en una "escena": un cielo (gradiente),
 * un acento y una capa de partículas. En vez del cristal oscuro con un solo azul
 * de marca, el cielo es claro/editorial y su acento oscila entre el naranja
 * cálido (sol) y el verde-azulado frío (lluvia/nieve/tormenta) — el mismo
 * duotono que usa el resto de Solsticio, resuelto aquí dinámicamente.
 */

export type ParticleKind = 'rays' | 'clouds' | 'rain' | 'storm' | 'snow' | 'stars' | 'fog' | null;

export type RainIntensity = 'light' | 'moderate' | 'heavy';

export type WeatherSceneKey =
  | 'clear-day'
  | 'clear-night'
  | 'partly-cloudy'
  | 'partly-cloudy-night'
  | 'cloudy'
  | 'cloudy-night'
  | 'fog'
  | 'fog-night'
  | 'rain'
  | 'rain-night'
  | 'storm'
  | 'snow'
  | 'snow-night';

export type SceneTokens = {
  /** Gradiente de cielo, de arriba a abajo. */
  sky: [string, string, string];
  /** Resplandor ambiental (glow) detrás del hero. */
  glow: string;
  /** Acento de la escena: usado en el "°", chips activos, indicadores. */
  accent: string;
  accentSoft: string;
  particles: ParticleKind;
  /**
   * Tinta recomendada para texto/íconos sobre este cielo: 'dark' en cielos
   * claros de día, 'light' en cielos densos (lluvia fuerte, tormenta, noche)
   * para mantener siempre la legibilidad.
   */
  ink: 'dark' | 'light';
};

export const WEATHER_SCENES: Record<WeatherSceneKey, SceneTokens> = {
  'clear-day': {
    sky: ['#fbeed2', '#f6d9a8', '#d99a63'],
    glow: 'rgba(226, 98, 43, 0.16)',
    accent: '#e2622b',
    accentSoft: '#f3c9a8',
    particles: 'rays',
    ink: 'dark',
  },
  'clear-night': {
    sky: ['#2c2a4d', '#221f42', '#100f22'],
    glow: 'rgba(226, 231, 245, 0.16)',
    accent: '#e7ecf5',
    accentSoft: '#c9d2e8',
    particles: 'stars',
    ink: 'light',
  },
  'partly-cloudy': {
    sky: ['#eef1ea', '#dfe6df', '#b7c3bd'],
    glow: 'rgba(217, 138, 58, 0.12)',
    accent: '#d98a3a',
    accentSoft: '#f3d9ae',
    particles: 'clouds',
    ink: 'dark',
  },
  'partly-cloudy-night': {
    sky: ['#2f3350', '#262a45', '#141625'],
    glow: 'rgba(226, 231, 245, 0.1)',
    accent: '#e7ecf5',
    accentSoft: '#c9d2e8',
    particles: 'clouds',
    ink: 'light',
  },
  cloudy: {
    sky: ['#dfe3e6', '#c7ced3', '#96a2aa'],
    glow: 'rgba(127, 143, 151, 0.14)',
    accent: '#7f8f97',
    accentSoft: '#c3ccd1',
    particles: 'clouds',
    ink: 'dark',
  },
  'cloudy-night': {
    sky: ['#2a2e38', '#20242c', '#14171d'],
    glow: 'rgba(148, 163, 184, 0.1)',
    accent: '#93a1ac',
    accentSoft: '#c7cfd6',
    particles: 'clouds',
    ink: 'light',
  },
  fog: {
    sky: ['#e6ebe7', '#d4dcd6', '#b6c1b9'],
    glow: 'rgba(126, 163, 148, 0.14)',
    accent: '#7ea394',
    accentSoft: '#c7ddd2',
    particles: 'fog',
    ink: 'dark',
  },
  'fog-night': {
    sky: ['#26302c', '#1c2521', '#111714'],
    glow: 'rgba(126, 163, 148, 0.12)',
    accent: '#7ea394',
    accentSoft: '#a9c5ba',
    particles: 'fog',
    ink: 'light',
  },
  // Lluvia: la escena donde manda el verde-azulado frío de Solsticio — el
  // mismo acento que usan las alertas de "moderada" en el resto de la app.
  rain: {
    sky: ['#d9e2e6', '#bccbd2', '#89a0ab'],
    glow: 'rgba(31, 111, 107, 0.14)',
    accent: '#1f6f6b',
    accentSoft: '#a8d4cf',
    particles: 'rain',
    ink: 'dark',
  },
  'rain-night': {
    sky: ['#1c2a30', '#152026', '#0c1417'],
    glow: 'rgba(31, 111, 107, 0.16)',
    accent: '#4fb3ab',
    accentSoft: '#a8d4cf',
    particles: 'rain',
    ink: 'light',
  },
  storm: {
    sky: ['#3c3450', '#332b47', '#181529'],
    glow: 'rgba(167, 139, 218, 0.2)',
    accent: '#c3aef2',
    accentSoft: '#e4d9fa',
    particles: 'storm',
    ink: 'light',
  },
  snow: {
    sky: ['#eef4f7', '#dbe7ee', '#aec4d1'],
    glow: 'rgba(95, 168, 201, 0.16)',
    accent: '#3f8caf',
    accentSoft: '#cfe8f2',
    particles: 'snow',
    ink: 'dark',
  },
  'snow-night': {
    sky: ['#212c3a', '#182230', '#0e1620'],
    glow: 'rgba(95, 168, 201, 0.14)',
    accent: '#6fb6d6',
    accentSoft: '#cfe8f2',
    particles: 'snow',
    ink: 'light',
  },
};

const FOG_CODES = new Set([45, 48]);
const LIGHT_RAIN_CODES = new Set([51, 53, 61, 80]);
const HEAVY_RAIN_CODES = new Set([55, 63, 65, 81, 82]);
const RAIN_CODES = new Set([...LIGHT_RAIN_CODES, ...HEAVY_RAIN_CODES]);
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

/**
 * Igual que `isNightNow`, pero para una hora arbitraria (ej. una franja del
 * pronóstico por horas) en vez de "ahora". Compara solo la hora del reloj
 * contra el amanecer/atardecer de hoy en esa localidad — suficiente para
 * las próximas horas/días, sin recalcular el orto/ocaso exacto de cada día.
 */
export function isTimeNight(time: Date, sunrise?: string | null, sunset?: string | null): boolean {
  if (sunrise && sunset) {
    const sunriseD = new Date(sunrise);
    const sunsetD = new Date(sunset);
    if (!Number.isNaN(sunriseD.getTime()) && !Number.isNaN(sunsetD.getTime())) {
      const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
      const timeMinutes = minutesOf(time);
      return timeMinutes < minutesOf(sunriseD) || timeMinutes >= minutesOf(sunsetD);
    }
  }
  const hour = time.getHours();
  return hour < 5 || hour >= 19;
}

export function getWeatherScene(code: number | undefined, isNight: boolean): WeatherSceneKey {
  if (code == null) return isNight ? 'clear-night' : 'clear-day';
  if (STORM_CODES.has(code)) return 'storm';
  if (SNOW_CODES.has(code)) return isNight ? 'snow-night' : 'snow';
  if (RAIN_CODES.has(code)) return isNight ? 'rain-night' : 'rain';
  if (FOG_CODES.has(code)) return isNight ? 'fog-night' : 'fog';
  if (code === 3) return isNight ? 'cloudy-night' : 'cloudy';
  if (code === 1 || code === 2) return isNight ? 'partly-cloudy-night' : 'partly-cloudy';
  return isNight ? 'clear-night' : 'clear-day';
}

export function sceneForCode(code: number | undefined, isNight: boolean): SceneTokens {
  return WEATHER_SCENES[getWeatherScene(code, isNight)];
}

/** Lluvia tenue vs. fuerte: mismo cielo/escena "rain", partículas más o menos densas. */
export function getRainIntensity(code: number | undefined): RainIntensity {
  if (code != null && HEAVY_RAIN_CODES.has(code)) return 'heavy';
  if (code != null && LIGHT_RAIN_CODES.has(code)) return 'light';
  return 'moderate';
}
