import { useState, useCallback } from 'react';
import { Weather, Location, City } from '../types';
import { fetchWeather as apiFetchWeather, fetchAddress as apiFetchAddress, saveLocation as apiSaveLocation, searchCities as apiSearchCities } from '../core/api/weatherApi';
import { getToken } from '../core/auth/authStorage';

type WeatherStatus = 'idle' | 'loading' | 'ready' | 'error';

const WEATHER_CODES: Record<number, string> = {
  0: 'Despejado',
  1: 'Mayormente despejado',
  2: 'Parcialmente nublado',
  3: 'Nublado',
  45: 'Niebla',
  48: 'Niebla con escarcha',
  51: 'Llovizna ligera',
  53: 'Llovizna',
  55: 'Llovizna intensa',
  61: 'Lluvia ligera',
  63: 'Lluvia',
  65: 'Lluvia intensa',
  71: 'Nieve ligera',
  73: 'Nieve',
  75: 'Nieve intensa',
  80: 'Chubascos ligeros',
  81: 'Chubascos',
  82: 'Chubascos intensos',
  95: 'Tormenta',
  96: 'Tormenta con granizo',
  99: 'Tormenta con granizo fuerte',
};

export function useWeather() {
  const [status, setStatus] = useState<WeatherStatus>('idle');
  const [weather, setWeather] = useState<Weather | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const getWeatherDescription = useCallback((code: number): string => {
    return WEATHER_CODES[code] ?? 'Condición desconocida';
  }, []);

  const fetchWeather = useCallback(async (latitude: number, longitude: number) => {
    setStatus('loading');
    setMessage('');

    try {
      const data = await apiFetchWeather(latitude, longitude);
      const current = data?.current;

      if (!current) throw new Error('Datos incompletos');

      setWeather({
        temperature: current.temperature_2m,
        weather_code: current.weather_code,
        wind_speed: current.wind_speed_10m,
      });
      setLocation({ latitude, longitude });
      setUpdatedAt(new Date().toLocaleTimeString());
      setStatus('ready');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Error desconocido');
    }
  }, []);

  const fetchAddress = useCallback(async (latitude: number, longitude: number) => {
    try {
      const data = await apiFetchAddress(latitude, longitude);
      setAddress(data?.display_name ?? null);
    } catch (error) {
      console.warn('Error fetching address:', error);
    }
  }, []);

  const searchCities = useCallback(async (query: string): Promise<City[]> => {
    if (!query.trim()) return [];
    try {
      const data = await apiSearchCities(query.trim());
      return data.results ?? [];
    } catch (error) {
      console.warn('Error searching cities:', error);
      return [];
    }
  }, []);

  const persistLocation = useCallback(async (weatherData?: Weather) => {
    if (!location) return;
    try {
      const token = await getToken();
      await apiSaveLocation({
        latitude: location.latitude,
        longitude: location.longitude,
        address: address ?? undefined,
        temperature: weatherData?.temperature,
        weather_code: weatherData?.weather_code,
        wind_speed: weatherData?.wind_speed,
      }, token);
    } catch (error) {
      console.warn('Error persisting location:', error);
    }
  }, [location, address]);

  const getWeatherIcon = useCallback((code: number): string => {
    if (code === 0) return '☀️';
    if (code <= 3) return '⛅';
    if (code >= 45 && code <= 48) return '🌫️';
    if (code >= 51 && code <= 67) return '🌧️';
    if (code >= 71 && code <= 77) return '❄️';
    if (code >= 80 && code <= 82) return '🌦️';
    if (code >= 95) return '⛈️';
    return '🌡️';
  }, []);

  return {
    weather,
    location,
    address,
    message,
    status,
    updatedAt,
    getWeatherDescription,
    getWeatherIcon,
    fetchWeather,
    fetchAddress,
    searchCities,
    persistLocation,
  };
}