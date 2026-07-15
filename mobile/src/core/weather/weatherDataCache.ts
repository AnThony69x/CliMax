import { API_URL } from '../api/apiConfig';

export type WeatherCoords = {
  latitude: number;
  longitude: number;
};

export type WeatherFetchOptions = {
  forceRefresh?: boolean;
};

export type WeatherApiResponse = {
  current?: {
    temperature_2m: number;
    weather_code: number;
    wind_speed_10m: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    pressure_msl?: number;
    visibility?: number;
    uv_index?: number;
    wind_gusts_10m?: number;
    wind_direction_10m?: number;
  };
  hourly?: Record<string, number[] | string[] | undefined>;
  daily?: Record<string, number[] | string[] | undefined>;
  timezone?: string;
  utc_offset_seconds?: number;
};

const WEATHER_TTL_MS = 10 * 60 * 1000;
const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEntry<T> = {
  value: T;
  timestamp: number;
};

const weatherCache = new Map<string, CacheEntry<unknown>>();
const addressCache = new Map<string, CacheEntry<string | null>>();
const weatherRequests = new Map<string, Promise<unknown>>();
const addressRequests = new Map<string, Promise<string | null>>();

function coordsKey(coords: WeatherCoords) {
  return `${coords.latitude.toFixed(3)},${coords.longitude.toFixed(3)}`;
}

function getFreshEntry<T>(cache: Map<string, CacheEntry<T>>, key: string, ttlMs: number) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export async function fetchWeatherForCoords<T = WeatherApiResponse>(
  coords: WeatherCoords,
  options: WeatherFetchOptions = {}
): Promise<T> {
  const key = coordsKey(coords);
  if (!options.forceRefresh) {
    const cached = getFreshEntry(weatherCache, key, WEATHER_TTL_MS);
    if (cached) return cached.value as T;
  }

  const requestKey = options.forceRefresh ? `${key}:fresh` : key;
  const inFlight = weatherRequests.get(requestKey);
  if (inFlight) return inFlight as Promise<T>;

  const freshParam = options.forceRefresh ? '&fresh=1' : '';
  const request = fetch(
    `${API_URL}/clima?lat=${coords.latitude}&lon=${coords.longitude}${freshParam}`
  )
    .then(async (response) => {
      if (!response.ok) throw new Error('Error fetching weather');
      const payload = await response.json();
      weatherCache.set(key, { value: payload, timestamp: Date.now() });
      return payload;
    })
    .finally(() => {
      weatherRequests.delete(requestKey);
    });

  weatherRequests.set(requestKey, request);
  return request as Promise<T>;
}

export async function fetchAddressForCoords(
  coords: WeatherCoords,
  options: WeatherFetchOptions = {}
): Promise<string | null> {
  const key = coordsKey(coords);
  if (!options.forceRefresh) {
    const cached = getFreshEntry(addressCache, key, GEOCODE_TTL_MS);
    if (cached) return cached.value;
  }

  const requestKey = options.forceRefresh ? `${key}:fresh` : key;
  const inFlight = addressRequests.get(requestKey);
  if (inFlight) return inFlight;

  const request = fetch(`${API_URL}/geocode?lat=${coords.latitude}&lon=${coords.longitude}`)
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = await response.json();
      const displayName = typeof payload?.display_name === 'string' ? payload.display_name : null;
      addressCache.set(key, { value: displayName, timestamp: Date.now() });
      return displayName;
    })
    .finally(() => {
      addressRequests.delete(requestKey);
    });

  addressRequests.set(requestKey, request);
  return request;
}

export function clearWeatherCache() {
  weatherCache.clear();
  addressCache.clear();
  weatherRequests.clear();
  addressRequests.clear();
}
