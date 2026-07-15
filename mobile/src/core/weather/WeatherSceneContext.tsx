import * as Location from 'expo-location';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { API_URL } from '../api/weatherApi';
import { getWeatherScene, isNightNow, WEATHER_SCENES, type SceneTokens } from '../../theme/weatherScenes';

const POLL_MS = 10 * 60 * 1000;

type WeatherSceneContextValue = {
  code: number | undefined;
  isNight: boolean;
  scene: SceneTokens;
};

function currentFallback(): WeatherSceneContextValue {
  const isNight = isNightNow(null, null);
  return { code: undefined, isNight, scene: WEATHER_SCENES[getWeatherScene(undefined, isNight)] };
}

const WeatherSceneContext = createContext<WeatherSceneContextValue>(currentFallback());

/**
 * Tema vivo global para pantallas fuera del carrusel principal. Mantiene su
 * propia lectura ligera de ubicación/clima y el backend evita golpes repetidos
 * a Open-Meteo mediante cache.
 */
export function WeatherSceneProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<WeatherSceneContextValue>(currentFallback());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const applyWeather = (code: number | undefined, sunrise: string | null, sunset: string | null) => {
      if (!isMountedRef.current) return;
      const isNight = isNightNow(sunrise, sunset);
      setValue({ code, isNight, scene: WEATHER_SCENES[getWeatherScene(code, isNight)] });
    };

    const fetchForCoords = async (latitude: number, longitude: number) => {
      try {
        const res = await fetch(`${API_URL}/clima?lat=${latitude}&lon=${longitude}`);
        if (!res.ok) return;
        const data = await res.json();
        const code = data?.current?.weather_code;
        const sunrise = data?.daily?.sunrise?.[0] ?? null;
        const sunset = data?.daily?.sunset?.[0] ?? null;
        applyWeather(typeof code === 'number' ? code : undefined, sunrise, sunset);
      } catch {
        // Mantener la escena previa (o el fallback por hora) si falla la red.
      }
    };

    const getWebPosition = () =>
      new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) =>
            resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
          (error) => reject(error),
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
        );
      });

    const bootstrap = async () => {
      try {
        if (Platform.OS === 'web') {
          if (!navigator.geolocation) return;
          const coords = await getWebPosition();
          if (!isMountedRef.current) return;
          await fetchForCoords(coords.latitude, coords.longitude);
          pollTimer = setInterval(() => {
            void getWebPosition()
              .then((next) => fetchForCoords(next.latitude, next.longitude))
              .catch(() => {});
          }, POLL_MS);
          return;
        }

        const perm = await Location.requestForegroundPermissionsAsync();
        if (!isMountedRef.current || perm.status !== 'granted') return;

        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        if (!isMountedRef.current) return;
        await fetchForCoords(loc.coords.latitude, loc.coords.longitude);

        pollTimer = setInterval(() => {
          void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low })
            .then((next) => fetchForCoords(next.coords.latitude, next.coords.longitude))
            .catch(() => {});
        }, POLL_MS);
      } catch {
        // Sin ubicación disponible: se mantiene la escena por hora (día/noche).
      }
    };

    void bootstrap();

    return () => {
      isMountedRef.current = false;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  return <WeatherSceneContext.Provider value={value}>{children}</WeatherSceneContext.Provider>;
}

export function useWeatherScene() {
  return useContext(WeatherSceneContext);
}
