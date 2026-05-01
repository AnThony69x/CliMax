import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { City } from '../../types';

const STORAGE_KEY = '@climax_saved_cities';
const MAX_CITIES = 10;

type CitiesContextValue = {
  savedCities: City[];
  addCity: (city: City) => void;
  removeCity: (id: string) => void;
  hasCity: (id: string) => boolean;
};

const CitiesContext = createContext<CitiesContextValue>({
  savedCities: [],
  addCity: () => {},
  removeCity: () => {},
  hasCity: () => false,
});

export function CitiesProvider({ children }: { children: React.ReactNode }) {
  const [savedCities, setSavedCities] = useState<City[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setSavedCities(JSON.parse(raw) as City[]);
      })
      .catch(() => {});
  }, []);

  const persist = useCallback((cities: City[]) => {
    setSavedCities(cities);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cities)).catch(() => {});
  }, []);

  const addCity = useCallback(
    (city: City) => {
      setSavedCities((prev) => {
        if (prev.some((c) => c.id === city.id)) return prev;
        const next = [city, ...prev].slice(0, MAX_CITIES);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    []
  );

  const removeCity = useCallback(
    (id: string) => {
      setSavedCities((prev) => {
        const next = prev.filter((c) => c.id !== id);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    []
  );

  const hasCity = useCallback(
    (id: string) => savedCities.some((c) => c.id === id),
    [savedCities]
  );

  return (
    <CitiesContext.Provider value={{ savedCities, addCity, removeCity, hasCity }}>
      {children}
    </CitiesContext.Provider>
  );
}

export function useCities() {
  return useContext(CitiesContext);
}
