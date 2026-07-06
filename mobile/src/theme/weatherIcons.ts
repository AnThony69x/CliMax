import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

export type WeatherIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export const WEATHER_ICON_LABELS: Record<number, { label: string; icon: WeatherIconName; iconNight?: WeatherIconName }> = {
  0: { label: 'Despejado', icon: 'weather-sunny', iconNight: 'weather-night' },
  1: { label: 'Mayormente despejado', icon: 'weather-partly-cloudy', iconNight: 'weather-night-partly-cloudy' },
  2: { label: 'Parcialmente nublado', icon: 'weather-partly-cloudy', iconNight: 'weather-night-partly-cloudy' },
  3: { label: 'Nublado', icon: 'weather-cloudy' },
  45: { label: 'Niebla', icon: 'weather-fog' },
  48: { label: 'Niebla con escarcha', icon: 'weather-fog' },
  51: { label: 'Llovizna ligera', icon: 'weather-partly-rainy' },
  53: { label: 'Llovizna', icon: 'weather-partly-rainy' },
  55: { label: 'Llovizna intensa', icon: 'weather-pouring' },
  61: { label: 'Lluvia ligera', icon: 'weather-partly-rainy' },
  63: { label: 'Lluvia', icon: 'weather-rainy' },
  65: { label: 'Lluvia intensa', icon: 'weather-pouring' },
  71: { label: 'Nieve ligera', icon: 'weather-partly-snowy' },
  73: { label: 'Nieve', icon: 'weather-snowy' },
  75: { label: 'Nieve intensa', icon: 'weather-snowy-heavy' },
  80: { label: 'Chubascos ligeros', icon: 'weather-partly-rainy' },
  81: { label: 'Chubascos', icon: 'weather-pouring' },
  82: { label: 'Chubascos intensos', icon: 'weather-pouring' },
  95: { label: 'Tormenta', icon: 'weather-lightning-rainy' },
  96: { label: 'Tormenta con granizo', icon: 'weather-hail' },
  99: { label: 'Tormenta con granizo fuerte', icon: 'weather-hail' },
};

export const DEFAULT_WEATHER_ICON: WeatherIconName = 'thermometer';
export const LOADING_WEATHER_ICON: WeatherIconName = 'timer-sand';

export function weatherIconInfo(code: number | undefined, isNight = false) {
  if (code == null) return { label: 'Cargando...', icon: LOADING_WEATHER_ICON as WeatherIconName };
  const entry = WEATHER_ICON_LABELS[code];
  if (!entry) return { label: 'Condición desconocida', icon: DEFAULT_WEATHER_ICON };
  return {
    label: entry.label,
    icon: isNight && entry.iconNight ? entry.iconNight : entry.icon,
  };
}
