import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccess } from '../../core/access/AccessContext';
import { useCities } from '../../core/cities/CitiesContext';
import { getToken } from '../../core/auth/authStorage';
import { API_URL } from '../../core/api/weatherApi';
import { MapView, Marker, UrlTile } from '../../components/NativeWeatherMap';
import {
  applyLocationPrecision,
  type AccountPreferences,
  useAccountPreferences,
} from '../../core/preferences/accountPreferences';
import type { City } from '../../types';
import { premiumColors, premiumRadii, premiumShadow } from '../../theme/premium';
import { weatherIconInfo } from '../../theme/weatherIcons';
import { getWeatherScene, isNightNow, isTimeNight, WEATHER_SCENES } from '../../theme/weatherScenes';
import { WeatherSceneBackground } from '../../components/weather/WeatherSceneBackground';
import { MoonPhaseGlobe } from '../../components/weather/MoonPhaseGlobe';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type WeatherState = {
  temperature: number;
  weatherCode: number;
  windSpeed: number;
  tempMax?: number | null;
  tempMin?: number | null;
  hourlyTimes?: string[] | null;
  hourlyTemps?: number[] | null;
  hourlyRain?: number[] | null;
  hourlyCodes?: number[] | null;
  dailyTimes?: string[] | null;
  dailyMin?: number[] | null;
  dailyMax?: number[] | null;
  dailyRain?: number[] | null;
  dailyCodes?: number[] | null;
  feelsLike?: number | null;
  humidity?: number | null;
  pressure?: number | null;
  visibility?: number | null;
  uvIndex?: number | null;
  precipitationSum?: number | null;
  precipitationProbability?: number | null;
  windGusts?: number | null;
  windDirection?: number | null;
  sunrise?: string | null;
  sunset?: string | null;
};

type SlideData = {
  key: string;
  label: string;
  cityName: string;
  coords: { latitude: number; longitude: number } | null;
  weather: WeatherState | null;
  updatedAt: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  message: string;
};

const SURFACE_DEEPER = premiumColors.surface;
const ACCENT = premiumColors.accent;
const GLASS_BG = 'rgba(27,32,39,0.05)';
const GLASS_BORDER = premiumColors.glassBorder;
const GLASS_BORDER_HI = premiumColors.glassBorderHi;
const RAIN_LIGHT = '#3b82f6';
const RAIN_MODERATE = '#8b5cf6';
const RAIN_STRONG = '#d946ef';
const RAIN_EXTREME = '#facc15';
const TEMP_COOL = '#22d3ee';
const TEMP_WARM = '#fbbf24';
const TEMP_HOT = '#f97316';
const TEMP_EXTREME = '#ef4444';
const OSM_TILE_URL = 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
const WORLD_REGION = {
  latitude: 0,
  longitude: 0,
  latitudeDelta: 170,
  longitudeDelta: 360,
};
const ECUADOR_REGION = {
  latitude: -1.83,
  longitude: -78.18,
  latitudeDelta: 140,
  longitudeDelta: 360,
};

const RAIN_CODES = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99]);

function weatherInfo(code: number | undefined, isNight = false) {
  return weatherIconInfo(code, isNight);
}

function formatTempRounded(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return '--';
  return `${Math.round(v)}`;
}

function formatVisibilityKm(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return '--';
  return (v / 1000).toFixed(1);
}

function formatWindDirection(deg: number | null | undefined) {
  if (deg == null || Number.isNaN(deg)) return '--';
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const index = Math.round((deg % 360) / 45) % 8;
  return directions[index];
}

function buildSummary(weather: WeatherState | null) {
  if (!weather) return 'Sin datos suficientes para el resumen.';
  const info = weatherInfo(weather.weatherCode);
  const temp = formatTempRounded(weather.temperature);
  const rainChance = weather.precipitationProbability ?? null;
  const rainText = rainChance != null ? `Prob. lluvia ${Math.round(rainChance)}%.` : '';
  return `Cielo ${info.label.toLowerCase()} con ${temp}°. ${rainText}`.trim();
}

function moonPhaseLabel(date = new Date()) {
  const knownNewMoon = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
  const days = (date.getTime() - knownNewMoon.getTime()) / 86400000;
  const synodicMonth = 29.53058867;
  const phase = ((days % synodicMonth) + synodicMonth) % synodicMonth;
  if (phase < 1.84566) return 'Nueva';
  if (phase < 5.53699) return 'Creciente';
  if (phase < 9.22831) return 'Cuarto creciente';
  if (phase < 12.91963) return 'Gibosa creciente';
  if (phase < 16.61096) return 'Llena';
  if (phase < 20.30228) return 'Gibosa menguante';
  if (phase < 23.99361) return 'Cuarto menguante';
  if (phase < 27.68493) return 'Menguante';
  return 'Nueva';
}

function moonPhaseData(date = new Date()) {
  const knownNewMoon = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
  const synodicMonth = 29.53058867;
  const days = (date.getTime() - knownNewMoon.getTime()) / 86400000;
  const phase = ((days % synodicMonth) + synodicMonth) % synodicMonth;
  const illumination = Math.round(
    (1 - Math.cos((2 * Math.PI * phase) / synodicMonth)) * 50
  );
  const daysToFull = Math.round(
    (synodicMonth / 2 - phase + synodicMonth) % synodicMonth
  );
  const daysToNew = Math.round((synodicMonth - phase) % synodicMonth);
  return {
    label: moonPhaseLabel(date),
    illumination,
    daysToFull,
    daysToNew,
    /** Fracción del ciclo sinódico (0 = luna nueva, 0.5 = llena, <1 = nueva otra vez). */
    phaseFraction: phase / synodicMonth,
  };
}

/** Icono de “posición actual” (GPS): mira de puntería, sin pin de mapa. */
function gpsLocationIconProps() {
  if (Platform.OS === 'ios') {
    return { name: 'locate' as const, size: 22 };
  }
  return { name: 'locate-outline' as const, size: 22 };
}

async function apiFetchWeather(latitude: number, longitude: number): Promise<WeatherState> {
  const res = await fetch(`${API_URL}/clima?lat=${latitude}&lon=${longitude}`);
  if (!res.ok) throw new Error('No se pudo obtener el clima');
  const data = await res.json();
  const current = data?.current;
  if (!current) throw new Error('Datos del clima incompletos');
  const hourly = data?.hourly as Record<string, number[] | string[] | undefined> | undefined;
  const daily = data?.daily as Record<string, number[] | string[] | undefined> | undefined;
  const tempMaxRaw = daily?.temperature_2m_max?.[0];
  const tempMinRaw = daily?.temperature_2m_min?.[0];
  const sunriseRaw = daily?.sunrise?.[0];
  const sunsetRaw = daily?.sunset?.[0];
  const uvMaxRaw = daily?.uv_index_max?.[0];
  const precipitationSumRaw = daily?.precipitation_sum?.[0];
  const precipitationProbRaw = daily?.precipitation_probability_max?.[0];
  const gustsMaxRaw = daily?.wind_gusts_10m_max?.[0];
  return {
    temperature: current.temperature_2m,
    weatherCode: current.weather_code,
    windSpeed: current.wind_speed_10m,
    tempMax: typeof tempMaxRaw === 'number' ? tempMaxRaw : null,
    tempMin: typeof tempMinRaw === 'number' ? tempMinRaw : null,
    hourlyTimes: Array.isArray(hourly?.time) ? (hourly?.time as string[]) : null,
    hourlyTemps: Array.isArray(hourly?.temperature_2m) ? (hourly?.temperature_2m as number[]) : null,
    hourlyRain: Array.isArray(hourly?.precipitation_probability)
      ? (hourly?.precipitation_probability as number[])
      : null,
    hourlyCodes: Array.isArray(hourly?.weather_code) ? (hourly?.weather_code as number[]) : null,
    dailyTimes: Array.isArray(daily?.time) ? (daily?.time as string[]) : null,
    dailyMin: Array.isArray(daily?.temperature_2m_min) ? (daily?.temperature_2m_min as number[]) : null,
    dailyMax: Array.isArray(daily?.temperature_2m_max) ? (daily?.temperature_2m_max as number[]) : null,
    dailyRain: Array.isArray(daily?.precipitation_probability_max)
      ? (daily?.precipitation_probability_max as number[])
      : null,
    dailyCodes: Array.isArray(daily?.weather_code) ? (daily?.weather_code as number[]) : null,
    feelsLike: typeof current.apparent_temperature === 'number' ? current.apparent_temperature : null,
    humidity: typeof current.relative_humidity_2m === 'number' ? current.relative_humidity_2m : null,
    pressure: typeof current.pressure_msl === 'number' ? current.pressure_msl : null,
    visibility: typeof current.visibility === 'number' ? current.visibility : null,
    uvIndex: typeof current.uv_index === 'number'
      ? current.uv_index
      : typeof uvMaxRaw === 'number'
        ? uvMaxRaw
        : null,
    precipitationSum: typeof precipitationSumRaw === 'number' ? precipitationSumRaw : null,
    precipitationProbability: typeof precipitationProbRaw === 'number' ? precipitationProbRaw : null,
    windGusts: typeof current.wind_gusts_10m === 'number'
      ? current.wind_gusts_10m
      : typeof gustsMaxRaw === 'number'
        ? gustsMaxRaw
        : null,
    windDirection: typeof current.wind_direction_10m === 'number' ? current.wind_direction_10m : null,
    sunrise: typeof sunriseRaw === 'string' ? sunriseRaw : null,
    sunset: typeof sunsetRaw === 'string' ? sunsetRaw : null,
  };
}

async function apiFetchAddress(latitude: number, longitude: number): Promise<string | null> {
  const res = await fetch(`${API_URL}/geocode?lat=${latitude}&lon=${longitude}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data?.display_name ?? null;
}

async function persistLocation(
  latitude: number,
  longitude: number,
  payload: { address: string | null; temperature: number; weatherCode: number; windSpeed: number }
) {
  try {
    const token = await getToken();
    await fetch(`${API_URL}/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        latitude,
        longitude,
        address: payload.address,
        temperature: payload.temperature,
        weather_code: payload.weatherCode,
        wind_speed: payload.windSpeed,
        captured_at: new Date().toISOString(),
      }),
    });
  } catch {
    // non-critical
  }
}

type HourlyItem = {
  key: string;
  label: string;
  temp: number | null;
  rainChance: number;
  icon: string;
  isNow?: boolean;
};

type WeeklyItem = {
  key: string;
  label: string;
  min: number;
  max: number;
  rainChance: number;
  icon: string;
};

function buildHourlyFromWeather(weather: WeatherState | null): HourlyItem[] | null {
  if (!weather?.hourlyTimes || !weather.hourlyTemps || !weather.hourlyCodes) return null;
  const now = new Date();
  const items: HourlyItem[] = [];
  for (let i = 0; i < weather.hourlyTimes.length; i += 1) {
    const time = new Date(weather.hourlyTimes[i]);
    if (time < now) continue;
    const label = items.length === 0 ? 'Ahora' : `${time.getHours()}:00`;
    const temp = weather.hourlyTemps[i] ?? null;
    const rainChance = weather.hourlyRain?.[i] ?? 0;
    const icon = weatherInfo(
      weather.hourlyCodes[i],
      isTimeNight(time, weather.sunrise, weather.sunset)
    ).icon;
    items.push({
      key: `${label}-${i}`,
      label,
      temp: typeof temp === 'number' ? Math.round(temp) : null,
      rainChance: typeof rainChance === 'number' ? Math.round(rainChance) : 0,
      icon,
      isNow: items.length === 1,
    });
    if (items.length >= 8) break;
  }
  return items.length ? items : null;
}

function buildWeeklyFromWeather(weather: WeatherState | null): WeeklyItem[] | null {
  if (!weather?.dailyTimes || !weather.dailyMin || !weather.dailyMax) return null;
  const days = weather.dailyTimes;
  const items: WeeklyItem[] = [];
  for (let i = 0; i < days.length && items.length < 8; i += 1) {
    const date = new Date(days[i]);
    const label = date
      .toLocaleDateString('es-ES', { weekday: 'short' })
      .replace('.', '')
      .slice(0, 3)
      .toUpperCase();
    const min = weather.dailyMin[i] ?? null;
    const max = weather.dailyMax[i] ?? null;
    if (min == null || max == null) continue;
    const rainChance = weather.dailyRain?.[i] ?? 0;
    const icon = weatherInfo(weather.dailyCodes?.[i]).icon;
    items.push({
      key: `${label}-${i}`,
      label,
      min: Math.round(min),
      max: Math.round(max),
      rainChance: typeof rainChance === 'number' ? Math.round(rainChance) : 0,
      icon,
    });
  }
  return items.length ? items : null;
}

function buildHourlyForecast(baseTemp: number | null, code?: number): HourlyItem[] {
  const now = new Date();
  return Array.from({ length: 8 }, (_, i) => {
    const time = new Date(now.getTime() + i * 60 * 60 * 1000);
    const hour = time.getHours();
    const label = i === 0 ? 'Ahora' : `${hour}:00`;
    const temp = baseTemp == null ? null : Math.round(baseTemp + Math.sin(i / 2) * 1.4 - i * 0.2);
    const rainChance = Math.min(95, Math.max(10, Math.round(35 + Math.sin(i) * 20 + (RAIN_CODES.has(code ?? -1) ? 20 : 0))));
    return {
      key: `${label}-${i}`,
      label,
      temp,
      rainChance,
      icon: weatherInfo(code, isTimeNight(time)).icon,
      isNow: i === 0,
    };
  });
}

function buildWeeklyForecast(
  tempMin?: number | null,
  tempMax?: number | null,
  code?: number
): WeeklyItem[] {
  const baseMin = tempMin ?? (tempMax != null ? tempMax - 6 : 19);
  const baseMax = tempMax ?? (tempMin != null ? tempMin + 7 : 26);
  const icon = weatherInfo(code).icon;
  const days = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom', 'Lun', 'Mar', 'Mie'];
  return days.slice(0, 8).map((day, i) => {
    const drift = Math.sin(i / 1.6) * 2;
    const min = Math.round(baseMin + drift - 1);
    const max = Math.round(baseMax + drift + 1);
    return {
      key: `${day}-${i}`,
      label: day,
      min,
      max,
      rainChance: Math.min(95, Math.max(15, Math.round(40 + Math.cos(i) * 18 + (RAIN_CODES.has(code ?? -1) ? 22 : 0)))),
      icon,
    };
  });
}

function GlassCard({
  children,
  style,
  intensity = 38,
}: {
  children: React.ReactNode;
  style?: any;
  intensity?: number;
}) {
  return (
    <BlurView intensity={intensity} tint="light" style={[styles.glassCard, style]}>
      <View style={styles.glassTopHighlight} pointerEvents="none" />
      <View style={styles.glassInner}>{children}</View>
    </BlurView>
  );
}

/* ─────────────────────────────────────────────
   WeatherSlide — una tarjeta del carrusel
───────────────────────────────────────────── */
function WeatherSlide({
  slide,
  onRefresh,
  isGPS,
  preferences,
}: {
  slide: SlideData;
  onRefresh?: () => void;
  isGPS: boolean;
  preferences: AccountPreferences;
}) {
  const insets = useSafeAreaInsets();
  const { hasEntitlement } = useAccess();
  const canUseAdvancedWeather = hasEntitlement('weather.comparisons');
  const isNight = isNightNow(slide.weather?.sunrise, slide.weather?.sunset);
  const info = weatherInfo(slide.weather?.weatherCode, isNight);
  const scene = WEATHER_SCENES[getWeatherScene(slide.weather?.weatherCode, isNight)];
  /**
   * Antes de tener el primer dato de clima, el fondo se muestra neutro
   * (ver WeatherSceneBackground) — así que el texto/ícono del hero no
   * deben tomar el acento/tinta de la escena real (podrían quedar
   * ilegibles, ej. blanco lunar sobre fondo claro) hasta que llegue.
   */
  const hasWeather = !!slide.weather;
  const displayAccent = hasWeather ? scene.accent : ACCENT;
  const displayInkColor = hasWeather ? (scene.ink === 'dark' ? '#1b2027' : '#fdf9f3') : '#1b2027';
  const heroPrimaryText = hasWeather ? (scene.ink === 'dark' ? 'rgba(27,32,39,0.9)' : 'rgba(253,249,243,0.92)') : 'rgba(27,32,39,0.9)';
  const heroMutedText = hasWeather ? (scene.ink === 'dark' ? 'rgba(148,163,184,0.95)' : 'rgba(253,249,243,0.7)') : 'rgba(148,163,184,0.95)';
  const glassBg = hasWeather ? (scene.ink === 'dark' ? 'rgba(27,32,39,0.05)' : 'rgba(253,249,243,0.10)') : 'rgba(27,32,39,0.05)';
  const refreshing = isGPS && slide.status === 'loading';
  const bottomPad = Math.max(insets.bottom, 12) + 84;
  const scrollY = useRef(new Animated.Value(0)).current;
  const mapScale = useRef(new Animated.Value(0)).current;
  const [mapExpanded, setMapExpanded] = useState(false);
  const mapRef = useRef<any>(null);
  const [mapRegion, setMapRegion] = useState(WORLD_REGION);
  const hourly = useMemo(() => {
    return (
      buildHourlyFromWeather(slide.weather) ||
      buildHourlyForecast(slide.weather?.temperature ?? null, slide.weather?.weatherCode)
    );
  }, [slide.weather]);
  const weekly = useMemo(() => {
    return (
      buildWeeklyFromWeather(slide.weather) ||
      buildWeeklyForecast(
        slide.weather?.tempMin ?? null,
        slide.weather?.tempMax ?? null,
        slide.weather?.weatherCode
      )
    );
  }, [slide.weather]);
  const moon = useMemo(() => moonPhaseData(), []);
  const [mapMode, setMapMode] = useState<'radar' | 'temp'>('radar');
  const [radarFrames, setRadarFrames] = useState<string[]>([]);
  const [radarIndex, setRadarIndex] = useState(0);
  const owmKey = process.env.EXPO_PUBLIC_OWM_API_KEY;
  const tempTileUrl = useMemo(() => {
    if (preferences.dataSaver) return null;
    if (!owmKey) return null;
    return `https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${owmKey}`;
  }, [preferences.dataSaver, owmKey]);
  const radarTileUrl = useMemo(() => {
    if (preferences.dataSaver) return null;
    const path = radarFrames[radarIndex];
    if (!path) return null;
    return `https://tilecache.rainviewer.com/v2/radar/${path}/256/{z}/{x}/{y}/2/1_1.png`;
  }, [preferences.dataSaver, radarFrames, radarIndex]);

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const buildZoomRegion = (region: typeof ECUADOR_REGION, factor: number) => {
    const nextLat = clamp(region.latitudeDelta * factor, 0.6, 170);
    const nextLon = clamp(region.longitudeDelta * factor, 1.2, 360);
    return { ...region, latitudeDelta: nextLat, longitudeDelta: nextLon };
  };

  const focusOnLocation = async () => {
    let coords = slide.coords;
    if (!coords) {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      } catch {
        return;
      }
    }
    const nextRegion = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      latitudeDelta: 4,
      longitudeDelta: 6,
    };
    setMapRegion(nextRegion);
    mapRef.current?.animateToRegion(nextRegion, 420);
  };

  const zoomIn = () => {
    const nextRegion = buildZoomRegion(mapRegion, 0.7);
    setMapRegion(nextRegion);
    mapRef.current?.animateToRegion(nextRegion, 320);
  };

  const zoomOut = () => {
    const nextRegion = buildZoomRegion(mapRegion, 1.35);
    setMapRegion(nextRegion);
    mapRef.current?.animateToRegion(nextRegion, 320);
  };

  useEffect(() => {
    if (!canUseAdvancedWeather) {
      setRadarFrames([]);
      setRadarIndex(0);
      return;
    }

    let frameTimer: ReturnType<typeof setInterval> | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;
    let isMounted = true;

    const loadRadarFrames = async () => {
      if (preferences.dataSaver) {
        setRadarFrames([]);
        setRadarIndex(0);
        return;
      }
      try {
        const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        if (!res.ok) return;
        const data = await res.json();
        const past = Array.isArray(data?.radar?.past) ? data.radar.past : [];
        const nowcast = Array.isArray(data?.radar?.nowcast) ? data.radar.nowcast : [];
        const frames = [...past, ...nowcast]
          .map((frame: { path?: string }) => frame?.path)
          .filter((path: string | undefined): path is string => typeof path === 'string');
        if (!isMounted) return;
        setRadarFrames(frames);
        setRadarIndex((prev) => (frames.length ? prev % frames.length : 0));
      } catch {
        // non-critical
      }
    };

    void loadRadarFrames();
    refreshTimer = setInterval(() => {
      void loadRadarFrames();
    }, 5 * 60 * 1000);

    frameTimer = setInterval(() => {
      setRadarIndex((prev) => (radarFrames.length ? (prev + 1) % radarFrames.length : 0));
    }, 750);

    return () => {
      isMounted = false;
      if (frameTimer) clearInterval(frameTimer);
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, [canUseAdvancedWeather, preferences.dataSaver, radarFrames.length]);

  useEffect(() => {
    Animated.timing(mapScale, {
      toValue: mapExpanded ? 1 : 0,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [mapExpanded, mapScale]);

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [1, 0.85],
    extrapolate: 'clamp',
  });
  const headerTranslate = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [0, -18],
    extrapolate: 'clamp',
  });
  return (
    <View style={styles.slideRoot}>
      <WeatherSceneBackground
        code={slide.weather?.weatherCode}
        isNight={isNight}
        particlesEnabled={!preferences.dataSaver}
      />

      <Animated.ScrollView
        style={{ width: SCREEN_WIDTH }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.slideScroll, { paddingTop: insets.top + 18, paddingBottom: bottomPad }]}
        refreshControl={
          isGPS ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={scene.accent}
              colors={[scene.accent]}
            />
          ) : undefined
        }
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
      >
        <Animated.View style={[styles.headerBlock, { opacity: headerOpacity, transform: [{ translateY: headerTranslate }] }]}
        >
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text style={[styles.headerTime, { color: heroPrimaryText }]}>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              {isGPS ? (
                <View style={styles.headerLocationRow}>
                  <Ionicons name="location" size={16} color={displayAccent} />
                  <Text style={styles.headerLocationLabel}>Ubicacion actual</Text>
                </View>
              ) : null}
            </View>
            {isGPS ? (
              <View style={[styles.headerGps, { borderColor: `${displayAccent}59`, backgroundColor: `${displayAccent}14` }]}>
                <Ionicons {...gpsLocationIconProps()} color={displayAccent} />
              </View>
            ) : null}
          </View>

          <Text
            style={[styles.cityName, { color: displayInkColor }]}
            numberOfLines={2}
          >
            {slide.cityName}
          </Text>
          <View style={styles.heroRow}>
            <View style={styles.tempCenterRow}>
              <Text style={[styles.temperatureHero, { color: displayInkColor }]}>{slide.weather ? Math.round(slide.weather.temperature) : '--'}</Text>
              <Text style={[styles.temperatureDegree, { color: displayAccent }]}>°</Text>
            </View>
            <View
              style={[
                styles.heroIconWrap,
                { backgroundColor: `${displayAccent}1f`, borderColor: `${displayAccent}40` },
              ]}
            >
              <MaterialCommunityIcons name={info.icon} size={38} color={displayAccent} />
            </View>
          </View>
          <Text style={[styles.conditionHero, { color: heroMutedText }]}>{info.label}</Text>

          {slide.status === 'loading' && !isGPS && (
            <ActivityIndicator color={displayAccent} style={styles.heroLoader} />
          )}
          {slide.updatedAt ? (
            <View style={styles.updatedRow}>
              <Ionicons name="time-outline" size={14} color="rgba(148,163,184,0.9)" />
              <Text style={[styles.updatedAt, { color: heroMutedText }]}>Actualizado · {slide.updatedAt}</Text>
            </View>
          ) : null}
        </Animated.View>

        <GlassCard style={[styles.summaryCard, { backgroundColor: glassBg }]}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>Resumen inteligente</Text>
            <View
              style={[
                styles.summaryChip,
                { backgroundColor: `${scene.accent}26`, borderColor: `${scene.accent}59` },
              ]}
            >
              <Text style={[styles.summaryChipText, { color: scene.accent }]}>Actual</Text>
            </View>
          </View>
          <Text style={styles.summaryText}>{buildSummary(slide.weather)}</Text>
          <View style={styles.summaryFooter}>
            <View style={[styles.summaryPill, { backgroundColor: `${scene.accent}1f` }]}>
              <Ionicons name="speedometer-outline" size={14} color={scene.accent} />
              <Text style={styles.summaryPillText}>{slide.weather?.windSpeed ?? '--'} km/h</Text>
            </View>
            <View style={styles.summaryPillSoft}>
              <Text style={styles.summaryPillTextSoft}>Max {formatTempRounded(slide.weather?.tempMax)}°</Text>
            </View>
            <View style={styles.summaryPillSoft}>
              <Text style={styles.summaryPillTextSoft}>Min {formatTempRounded(slide.weather?.tempMin)}°</Text>
            </View>
          </View>
        </GlassCard>

        {canUseAdvancedWeather ? (
          <>
        {preferences.weeklySummary ? (
          <GlassCard style={[styles.weeklySummaryCard, { backgroundColor: glassBg }]}>
            <View style={styles.summaryHeader}>
              <Text style={styles.summaryTitle}>Resumen semanal</Text>
              <View
                style={[
                  styles.summaryChip,
                  { backgroundColor: `${scene.accent}26`, borderColor: `${scene.accent}59` },
                ]}
              >
                <Text style={[styles.summaryChipText, { color: scene.accent }]}>Activo</Text>
              </View>
            </View>
            <Text style={styles.summaryText}>
              Esta semana se mueve entre {weekly[0]?.min ?? '--'}° y {weekly[0]?.max ?? '--'}° hoy,
              con tendencia de lluvia cercana al {weekly[0]?.rainChance ?? 0}%.
            </Text>
            <View style={styles.weeklySummaryGrid}>
              {weekly.slice(0, 4).map((day) => (
                <View key={day.key} style={styles.weeklySummaryItem}>
                  <Text style={[styles.weeklySummaryDay, { color: scene.accent }]}>{day.label}</Text>
                  <Text style={styles.weeklySummaryTemp}>{day.min}°/{day.max}°</Text>
                  <Text style={styles.weeklySummaryRain}>{day.rainChance}% lluvia</Text>
                </View>
              ))}
            </View>
          </GlassCard>
        ) : null}

        <GlassCard style={[styles.hourlyCard, { backgroundColor: glassBg }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>Pronostico por horas</Text>
            <Text style={styles.sectionTitle}>Por hora</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={120}
            decelerationRate="fast"
          >
            {hourly.map((slot) => (
              <View
                key={slot.key}
                style={[
                  styles.hourCard,
                  slot.isNow && [
                    styles.hourCardActive,
                    { backgroundColor: `${scene.accent}2e`, borderColor: `${scene.accent}59` },
                  ],
                ]}
              >
                <Text style={[styles.hourLabel, slot.isNow && styles.hourLabelActive]}>{slot.label}</Text>
                <MaterialCommunityIcons
                  name={slot.icon as any}
                  size={22}
                  color={slot.isNow ? '#1b2027' : 'rgba(27,32,39,0.85)'}
                  style={styles.hourIcon}
                />
                <Text style={styles.hourTemp}>{slot.temp != null ? `${slot.temp}°` : '--°'}</Text>
                <Text style={[styles.hourRain, { color: scene.accent }]}>{slot.rainChance}%</Text>
              </View>
            ))}
          </ScrollView>
        </GlassCard>

        <GlassCard style={[styles.weeklyCard, { backgroundColor: glassBg }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>Pronostico extendido</Text>
            <Text style={styles.sectionTitle}>10 dias</Text>
          </View>
          {weekly.map((day) => (
            <View key={day.key} style={styles.weekRow}>
              <Text style={styles.weekDay}>{day.label}</Text>
              <MaterialCommunityIcons
                name={day.icon as any}
                size={18}
                color="rgba(27,32,39,0.85)"
                style={styles.weekIcon}
              />
              <Text style={[styles.weekRain, { color: scene.accent }]}>{day.rainChance}%</Text>
              <Text style={styles.weekTempMin}>{day.min}°</Text>
              <View style={styles.weekRangeBar}>
                <View style={styles.weekRangeFill} />
                <View style={styles.weekRangeMarker} />
              </View>
              <Text style={styles.weekTempMax}>{day.max}°</Text>
            </View>
          ))}
        </GlassCard>

        <Pressable onPress={() => setMapExpanded(true)}>
          <GlassCard style={[styles.mapCard, { backgroundColor: glassBg }]}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionEyebrow}>Mapa de calor</Text>
                <Text style={styles.sectionTitle}>Radar de precipitacion</Text>
              </View>
              <Ionicons name="expand" size={18} color={scene.accent} />
            </View>
            <View style={styles.mapPreview}>
              {!preferences.dataSaver && MapView && slide.coords ? (
                <MapView
                  style={StyleSheet.absoluteFillObject}
                  initialRegion={WORLD_REGION}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                  mapType="none"
                >
                  {UrlTile ? (
                    <UrlTile
                      urlTemplate={OSM_TILE_URL}
                      maximumZ={19}
                      tileSize={256}
                      zIndex={1}
                    />
                  ) : null}
                  {UrlTile && radarTileUrl && mapMode === 'radar' ? (
                    <UrlTile
                      urlTemplate={radarTileUrl}
                      maximumZ={12}
                      tileSize={256}
                      zIndex={3}
                      opacity={0.95}
                    />
                  ) : null}
                  {UrlTile && tempTileUrl && mapMode === 'temp' ? (
                    <UrlTile
                      urlTemplate={tempTileUrl}
                      maximumZ={12}
                      tileSize={256}
                      zIndex={3}
                      opacity={0.9}
                    />
                  ) : null}
                  {Marker && slide.coords ? (
                    <Marker
                      coordinate={slide.coords}
                      title={slide.cityName}
                      pinColor="#e2622b"
                    />
                  ) : null}
                </MapView>
              ) : (
                <View style={styles.mapFallback}>
                  <Text style={styles.mapFallbackText}>
                    {preferences.dataSaver ? 'Ahorro de datos activo' : 'Mapa de calor disponible'}
                  </Text>
                </View>
              )}
              <View style={styles.mapOverlay} pointerEvents="box-none">
                <View style={styles.mapVignette} pointerEvents="none" />
                <View style={styles.mapLegend} pointerEvents="auto">
                  {mapMode === 'radar' ? (
                    <>
                      <View style={styles.mapLegendItem}>
                        <View style={[styles.mapDot, { backgroundColor: RAIN_EXTREME }]} />
                        <Text style={styles.mapLegendText}>Extrema</Text>
                      </View>
                      <View style={styles.mapLegendItem}>
                        <View style={[styles.mapDot, { backgroundColor: RAIN_STRONG }]} />
                        <Text style={styles.mapLegendText}>Fuerte</Text>
                      </View>
                      <View style={styles.mapLegendItem}>
                        <View style={[styles.mapDot, { backgroundColor: RAIN_MODERATE }]} />
                        <Text style={styles.mapLegendText}>Moderada</Text>
                      </View>
                      <View style={styles.mapLegendItem}>
                        <View style={[styles.mapDot, { backgroundColor: RAIN_LIGHT }]} />
                        <Text style={styles.mapLegendText}>Ligera</Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={styles.mapLegendItem}>
                        <View style={[styles.mapDot, { backgroundColor: TEMP_COOL }]} />
                        <Text style={styles.mapLegendText}>Fresco</Text>
                      </View>
                      <View style={styles.mapLegendItem}>
                        <View style={[styles.mapDot, { backgroundColor: TEMP_WARM }]} />
                        <Text style={styles.mapLegendText}>Templado</Text>
                      </View>
                      <View style={styles.mapLegendItem}>
                        <View style={[styles.mapDot, { backgroundColor: TEMP_HOT }]} />
                        <Text style={styles.mapLegendText}>Caliente</Text>
                      </View>
                      <View style={styles.mapLegendItem}>
                        <View style={[styles.mapDot, { backgroundColor: TEMP_EXTREME }]} />
                        <Text style={styles.mapLegendText}>Extremo</Text>
                      </View>
                    </>
                  )}
                </View>
                <View style={styles.mapFabColumn} pointerEvents="auto">
                  <Pressable
                    style={styles.mapFab}
                    onPress={() => setMapMode((prev) => (prev === 'radar' ? 'temp' : 'radar'))}
                  >
                    <Ionicons name="layers-outline" size={18} color="#e2e8f0" />
                  </Pressable>
                  <Pressable style={styles.mapFab}>
                    <Ionicons name="locate-outline" size={18} color="#e2e8f0" />
                  </Pressable>
                  <Pressable style={styles.mapFab}>
                    <Ionicons name="add" size={18} color="#e2e8f0" />
                  </Pressable>
                  <Pressable style={styles.mapFab}>
                    <Ionicons name="remove" size={18} color="#e2e8f0" />
                  </Pressable>
                </View>
              </View>
            </View>
          </GlassCard>
        </Pressable>

        <View style={styles.infoGrid}>
          <GlassCard style={styles.infoCardWide}>
            <View style={styles.moonHeader}>
              <View>
                <Text style={styles.infoTitle}>Luna</Text>
                <Text style={styles.infoValue}>{moon.label}</Text>
                <Text style={styles.infoHint}>{moon.illumination}% iluminada</Text>
              </View>
              <View style={styles.moonImageWrap}>
                <MoonPhaseGlobe size={68} phaseFraction={moon.phaseFraction} />
              </View>
            </View>
            <View style={styles.moonMetaRow}>
              <View style={styles.moonMetaItem}>
                <Text style={styles.moonMetaLabel}>Prox. luna llena</Text>
                <Text style={styles.moonMetaValue}>{moon.daysToFull} dias</Text>
              </View>
              <View style={styles.moonDivider} />
              <View style={styles.moonMetaItem}>
                <Text style={styles.moonMetaLabel}>Prox. luna nueva</Text>
                <Text style={styles.moonMetaValue}>{moon.daysToNew} dias</Text>
              </View>
            </View>
          </GlassCard>

          <GlassCard style={styles.infoCard}>
            <Text style={styles.infoTitle}>Sensacion termica</Text>
            <Text style={styles.infoValue}>{formatTempRounded(slide.weather?.feelsLike)}°</Text>
            <Text style={styles.infoHint}>Basado en humedad y viento.</Text>
          </GlassCard>
          <GlassCard style={styles.infoCard}>
            <Text style={styles.infoTitle}>Indice UV</Text>
            <Text style={styles.infoValue}>{slide.weather?.uvIndex ?? '--'}</Text>
            <View style={styles.uvBar}>
              <View
                style={[
                  styles.uvBarFill,
                  { width: `${Math.min(100, (slide.weather?.uvIndex ?? 0) * 10)}%` },
                ]}
              />
            </View>
            <Text style={styles.infoHint}>Proteccion recomendada.</Text>
          </GlassCard>
          <GlassCard style={styles.infoCard}>
            <Text style={styles.infoTitle}>Viento</Text>
            <Text style={styles.infoValue}>{slide.weather?.windSpeed ?? '--'} km/h</Text>
            <Text style={styles.infoHint}>
              Rafagas {slide.weather?.windGusts ?? '--'} km/h · {formatWindDirection(slide.weather?.windDirection)}
            </Text>
          </GlassCard>
          <GlassCard style={styles.infoCard}>
            <Text style={styles.infoTitle}>Precipitacion</Text>
            <Text style={styles.infoValue}>{slide.weather?.precipitationSum ?? '--'} mm</Text>
            <Text style={styles.infoHint}>Prob. max {slide.weather?.precipitationProbability ?? '--'}%.</Text>
          </GlassCard>
          <GlassCard style={styles.infoCard}>
            <Text style={styles.infoTitle}>Amanecer</Text>
            <Text style={styles.infoValue}>
              {slide.weather?.sunrise
                ? new Date(slide.weather.sunrise).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '--'}
            </Text>
            <Text style={styles.infoHint}>
              Atardecer {slide.weather?.sunset
                ? new Date(slide.weather.sunset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '--'}
            </Text>
          </GlassCard>
          <GlassCard style={styles.infoCard}>
            <Text style={styles.infoTitle}>Humedad</Text>
            <Text style={styles.infoValue}>{slide.weather?.humidity ?? '--'}%</Text>
            <Text style={styles.infoHint}>Nivel de humedad actual.</Text>
          </GlassCard>
          <GlassCard style={styles.infoCard}>
            <Text style={styles.infoTitle}>Visibilidad</Text>
            <Text style={styles.infoValue}>{formatVisibilityKm(slide.weather?.visibility)} km</Text>
            <Text style={styles.infoHint}>Condicion de horizonte.</Text>
          </GlassCard>
          <GlassCard style={styles.infoCard}>
            <Text style={styles.infoTitle}>Presion</Text>
            <Text style={styles.infoValue}>{slide.weather?.pressure ?? '--'} hPa</Text>
            <Text style={styles.infoHint}>Nivel atmosferico actual.</Text>
          </GlassCard>
        </View>
          </>
        ) : (
          <GlassCard style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <Text style={styles.summaryTitle}>Funciones Premium</Text>
              <View
                style={[
                  styles.summaryChip,
                  { backgroundColor: `${scene.accent}26`, borderColor: `${scene.accent}59` },
                ]}
              >
                <Text style={[styles.summaryChipText, { color: scene.accent }]}>Bloqueado</Text>
              </View>
            </View>
            <Text style={styles.summaryText}>
              Suscribete para ver pronostico por horas, 10 dias, radar, indice UV,
              humedad, presion y comparativas climaticas.
            </Text>
          </GlassCard>
        )}

        {slide.message ? <Text style={styles.errorText}>{slide.message}</Text> : null}
      </Animated.ScrollView>

      {canUseAdvancedWeather && mapExpanded && (
        <Animated.View
          style={[
            styles.mapOverlayFullscreen,
            {
              opacity: mapScale,
              transform: [
                {
                  scale: mapScale.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }),
                },
              ],
            },
          ]}
        >
          <View style={styles.mapFullscreenCard}>
            {!preferences.dataSaver && MapView && slide.coords ? (
              <MapView
                style={StyleSheet.absoluteFillObject}
                initialRegion={WORLD_REGION}
                mapType="none"
                scrollEnabled
                zoomEnabled
                pitchEnabled
                rotateEnabled
                maxZoomLevel={12}
                onRegionChangeComplete={setMapRegion}
                ref={mapRef}
              >
                {UrlTile ? (
                  <UrlTile
                    urlTemplate={OSM_TILE_URL}
                    maximumZ={19}
                    tileSize={256}
                    zIndex={1}
                  />
                ) : null}
                {UrlTile && radarTileUrl && mapMode === 'radar' ? (
                  <UrlTile
                    urlTemplate={radarTileUrl}
                    maximumZ={12}
                    tileSize={256}
                    zIndex={3}
                    opacity={0.95}
                  />
                ) : null}
                {UrlTile && tempTileUrl && mapMode === 'temp' ? (
                  <UrlTile
                    urlTemplate={tempTileUrl}
                    maximumZ={12}
                    tileSize={256}
                    zIndex={3}
                    opacity={0.9}
                  />
                ) : null}
                {Marker && slide.coords ? (
                  <Marker
                    coordinate={slide.coords}
                    title={slide.cityName}
                    pinColor="#e2622b"
                  />
                ) : null}
              </MapView>
            ) : (
              <View style={styles.mapFallback}>
                <Text style={styles.mapFallbackText}>
                  {preferences.dataSaver ? 'Ahorro de datos activo' : 'Vista de calor completa'}
                </Text>
              </View>
            )}
            <View style={styles.mapFullscreenOverlay} pointerEvents="box-none">
              <View style={styles.mapVignette} pointerEvents="none" />
              <View style={styles.mapLegendLeft} pointerEvents="auto">
                <Text style={styles.mapLegendTitle}>
                  {mapMode === 'radar' ? 'Precipitacion' : 'Temperatura'}
                </Text>
                <View style={styles.mapLegendRow}>
                  <View style={styles.mapLegendBar}>
                    {mapMode === 'radar' ? (
                      <>
                        <View style={[styles.mapLegendStop, { backgroundColor: RAIN_EXTREME }]} />
                        <View style={[styles.mapLegendStop, { backgroundColor: RAIN_STRONG }]} />
                        <View style={[styles.mapLegendStop, { backgroundColor: RAIN_MODERATE }]} />
                        <View style={[styles.mapLegendStop, { backgroundColor: RAIN_LIGHT }]} />
                      </>
                    ) : (
                      <>
                        <View style={[styles.mapLegendStop, { backgroundColor: TEMP_EXTREME }]} />
                        <View style={[styles.mapLegendStop, { backgroundColor: TEMP_HOT }]} />
                        <View style={[styles.mapLegendStop, { backgroundColor: TEMP_WARM }]} />
                        <View style={[styles.mapLegendStop, { backgroundColor: TEMP_COOL }]} />
                      </>
                    )}
                  </View>
                  <View style={styles.mapLegendLabels}>
                    {mapMode === 'radar' ? (
                      <>
                        <Text style={styles.mapLegendScale}>Extrema</Text>
                        <Text style={styles.mapLegendScale}>Fuerte</Text>
                        <Text style={styles.mapLegendScale}>Moderada</Text>
                        <Text style={styles.mapLegendScale}>Ligera</Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.mapLegendScale}>Extremo</Text>
                        <Text style={styles.mapLegendScale}>Caliente</Text>
                        <Text style={styles.mapLegendScale}>Templado</Text>
                        <Text style={styles.mapLegendScale}>Fresco</Text>
                      </>
                    )}
                  </View>
                </View>
              </View>
              <View style={styles.mapTimeline} pointerEvents="auto">
                {['Ahora', '+1h', '+2h', '+3h'].map((slot) => (
                  <View key={slot} style={styles.mapTimelineChip}>
                    <Text style={styles.mapTimelineText}>{slot}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.mapFabColumnFullscreen} pointerEvents="auto">
                <Pressable
                  style={styles.mapFab}
                  onPress={() => setMapMode((prev) => (prev === 'radar' ? 'temp' : 'radar'))}
                >
                  <Ionicons name="layers-outline" size={18} color="#e2e8f0" />
                </Pressable>
                <Pressable style={styles.mapFab} onPress={focusOnLocation}>
                  <Ionicons name="locate-outline" size={18} color="#e2e8f0" />
                </Pressable>
                <Pressable style={styles.mapFab} onPress={zoomIn}>
                  <Ionicons name="add" size={18} color="#e2e8f0" />
                </Pressable>
                <Pressable style={styles.mapFab} onPress={zoomOut}>
                  <Ionicons name="remove" size={18} color="#e2e8f0" />
                </Pressable>
              </View>
            </View>
          </View>
          <Pressable style={styles.mapCloseBtn} onPress={() => setMapExpanded(false)}>
            <Ionicons name="close" size={18} color="#e2e8f0" />
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

/* ─────────────────────────────────────────────
   HomeScreen principal
───────────────────────────────────────────── */
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { savedCities, removeCity } = useCities();
  const accountPreferences = useAccountPreferences();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Slide de GPS (siempre índice 0)
  const [gpsSlide, setGpsSlide] = useState<SlideData>({
    key: '__gps__',
    label: 'UBICACIÓN ACTUAL',
    cityName: 'Buscando ubicación...',
    coords: null,
    weather: null,
    updatedAt: null,
    status: 'idle',
    message: '',
  });

  // Slides de ciudades guardadas
  const [citySlides, setCitySlides] = useState<Record<string, SlideData>>({});

  const allSlides: SlideData[] = useMemo(() => {
    const cityItems = savedCities.map((c): SlideData => {
      const saved = citySlides[c.id];
      return {
        key: c.id,
        label: c.name,
        cityName: saved?.cityName ?? c.name,
        coords: saved?.coords ?? { latitude: c.lat, longitude: c.lon },
        weather: saved?.weather ?? null,
        updatedAt: saved?.updatedAt ?? null,
        status: saved?.status ?? 'idle',
        message: saved?.message ?? '',
      };
    });
    return [gpsSlide, ...cityItems];
  }, [gpsSlide, savedCities, citySlides]);

  const updateGpsSlide = (patch: Partial<SlideData>) =>
    setGpsSlide((prev) => ({ ...prev, ...patch }));

  const updateCitySlide = (id: string, patch: Partial<SlideData>) =>
    setCitySlides((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? {}), ...patch, key: id } as SlideData,
    }));

  // Cargar clima de GPS
  const loadGpsWeather = async (latitude: number, longitude: number) => {
    const safeCoords = applyLocationPrecision(
      latitude,
      longitude,
      accountPreferences.preciseLocation
    );
    updateGpsSlide({ status: 'loading', message: '' });
    try {
      const [weather, address] = await Promise.all([
        apiFetchWeather(safeCoords.latitude, safeCoords.longitude),
        apiFetchAddress(safeCoords.latitude, safeCoords.longitude),
      ]);
      const cityName = address
        ? address.split(',').slice(0, 2).join(',').trim()
        : `${safeCoords.latitude.toFixed(2)}, ${safeCoords.longitude.toFixed(2)}`;
      updateGpsSlide({
        coords: safeCoords,
        weather,
        cityName,
        updatedAt: new Date().toLocaleTimeString(),
        status: 'ready',
        message: '',
      });
      await persistLocation(safeCoords.latitude, safeCoords.longitude, {
        address,
        temperature: weather.temperature,
        weatherCode: weather.weatherCode,
        windSpeed: weather.windSpeed,
      });
    } catch {
      updateGpsSlide({ status: 'error', message: 'No se pudo obtener el clima' });
    }
  };

  // Cargar clima de ciudad guardada
  const loadCityWeather = async (city: City) => {
    updateCitySlide(city.id, { status: 'loading', message: '' });
    try {
      const weather = await apiFetchWeather(city.lat, city.lon);
      updateCitySlide(city.id, {
        key: city.id,
        cityName: city.name,
        coords: { latitude: city.lat, longitude: city.lon },
        weather,
        updatedAt: new Date().toLocaleTimeString(),
        status: 'ready',
        message: '',
      });
    } catch {
      updateCitySlide(city.id, { status: 'error', message: 'No se pudo obtener el clima' });
    }
  };

  // GPS polling seguro (evita errores de removeSubscription en algunos entornos)
  useEffect(() => {
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let isMounted = true;

    const readAndLoadLocation = async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!isMounted) return;
        await loadGpsWeather(loc.coords.latitude, loc.coords.longitude);
      } catch {
        if (!isMounted) return;
        updateGpsSlide({
          status: 'error',
          message:
            'Ubicación no disponible. Activa el GPS y los servicios de ubicación, o revisa permisos.',
        });
      }
    };

    (async () => {
      try {
        updateGpsSlide({ status: 'loading', message: '' });

        if (Platform.OS === 'web') {
          if (!navigator.geolocation) {
            updateGpsSlide({ status: 'error', message: 'Geolocalizacion no disponible en este navegador' });
            return;
          }

          const getWebPosition = async () =>
            new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(
                (position) =>
                  resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                  }),
                (error) => reject(error),
                {
                  enableHighAccuracy: true,
                  timeout: 15000,
                  maximumAge: 10000,
                }
              );
            });

          const coords = await getWebPosition();
          if (!isMounted) return;
          await loadGpsWeather(coords.latitude, coords.longitude);

          pollTimer = setInterval(() => {
            void getWebPosition()
              .then((next) => {
                if (!isMounted) return;
                return loadGpsWeather(next.latitude, next.longitude);
              })
              .catch(() => {
                // ignorar errores intermitentes en web polling
              });
          }, 30000);
          return;
        }

        const perm = await Location.requestForegroundPermissionsAsync();
        if (!isMounted) return;
        if (perm.status !== 'granted') {
          updateGpsSlide({ status: 'error', message: 'Permiso de ubicación denegado' });
          return;
        }

        await readAndLoadLocation();
        // Refresco periódico para mantener clima/ubicación al día sin usar watcher.
        pollTimer = setInterval(() => {
          void readAndLoadLocation();
        }, 30000);
      } catch {
        if (!isMounted) return;
        updateGpsSlide({
          status: 'error',
          message: 'No se pudo inicializar la ubicación en este dispositivo',
        });
      }
    })();
    return () => {
      isMounted = false;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  // Cargar clima de ciudades guardadas nuevas
  useEffect(() => {
    for (const city of savedCities) {
      if (!citySlides[city.id] || citySlides[city.id].status === 'idle') {
        loadCityWeather(city);
      }
    }
  }, [savedCities]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(idx);
  };

  const activeSlide = allSlides[activeIndex];
  const isActiveGPS = activeIndex === 0;
  const activeScene =
    WEATHER_SCENES[
      getWeatherScene(
        activeSlide?.weather?.weatherCode,
        isNightNow(activeSlide?.weather?.sunrise, activeSlide?.weather?.sunset)
      )
    ];
  /** Mientras no haya datos el fondo es neutro claro: forzar tinta oscura para el status bar. */
  const activeStatusBarInk = activeSlide?.weather ? activeScene.ink : 'dark';

  return (
    <View style={styles.container}>
      <StatusBar barStyle={activeStatusBarInk === 'dark' ? 'dark-content' : 'light-content'} backgroundColor="transparent" translucent />
      <View style={styles.bgGlowTop} />
      <View style={styles.bgGlowBottom} />

      {/* Botón eliminar ciudad (solo en slides no-GPS) */}
      {!isActiveGPS && activeSlide && (
        <Pressable
          style={[styles.removeBtn, { top: insets.top + 10 }]}
          accessibilityRole="button"
          accessibilityLabel="Quitar ciudad guardada"
          onPress={() => {
            const city = savedCities[activeIndex - 1];
            if (!city) return;
            removeCity(city.id);
            const newIdx = Math.max(0, activeIndex - 1);
            setActiveIndex(newIdx);
            scrollRef.current?.scrollTo({ x: newIdx * SCREEN_WIDTH, animated: true });
          }}
        >
          <Ionicons name="trash-outline" size={17} color="#b6432c" />
        </Pressable>
      )}

      {/* Carrusel horizontal */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {allSlides.map((slide, i) => (
          <WeatherSlide
            key={slide.key}
            slide={slide}
            isGPS={i === 0}
            preferences={accountPreferences}
            onRefresh={
              i === 0
                ? () => {
                    if (gpsSlide.coords) {
                      loadGpsWeather(gpsSlide.coords.latitude, gpsSlide.coords.longitude);
                    }
                  }
                : undefined
            }
          />
        ))}
      </ScrollView>

      {/* Indicadores de puntos */}
      {allSlides.length > 1 && (
        <View style={[styles.dotsCapsuleWrap, { paddingBottom: Math.max(insets.bottom, 8) + 6 }]}>
          <View style={styles.dotsCapsule}>
          {allSlides.map((_, i) => (
            <Pressable
              key={i}
              style={[
                styles.dot,
                i === activeIndex && [styles.dotActive, { backgroundColor: activeScene.accent }],
              ]}
              onPress={() => {
                setActiveIndex(i);
                scrollRef.current?.scrollTo({ x: i * SCREEN_WIDTH, animated: true });
              }}
            />
          ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SURFACE_DEEPER,
    overflow: 'hidden',
  },
  bgGlowTop: {
    position: 'absolute',
    top: -140,
    left: -120,
    width: 360,
    height: 360,
    borderRadius: 360,
    backgroundColor: premiumColors.auroraAqua,
    ...Platform.select({ android: { overflow: 'hidden' as const } }),
  },
  bgGlowBottom: {
    position: 'absolute',
    bottom: -140,
    right: -120,
    width: 360,
    height: 360,
    borderRadius: 360,
    backgroundColor: premiumColors.auroraTeal,
    ...Platform.select({ android: { overflow: 'hidden' as const } }),
  },
  slideRoot: {
    width: SCREEN_WIDTH,
    flex: 1,
    overflow: 'hidden',
  },
  slideScroll: {
    paddingHorizontal: 20,
    gap: 18,
  },

  removeBtn: {
    position: 'absolute',
    right: 18,
    zIndex: 10,
    backgroundColor: 'rgba(239,68,68,0.14)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(254,202,202,0.35)',
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    ...Platform.select<ViewStyle>({
      ios: {
        elevation: 6,
      },
      android: {
        // Sin elevation — el botón tiene borderRadius: 999 (círculo)
        // y la elevation en Android es rectangular, no respeta el radio.
        // Las shadow* props de iOS son ignoradas en Android.
      },
    }),
  },

  headerBlock: {
    paddingHorizontal: 6,
    marginBottom: 18,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    gap: 8,
  },
  headerTime: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(27,32,39,0.9)',
    letterSpacing: -0.3,
  },
  headerGps: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(226,98,43,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(226,98,43,0.08)',
  },
  headerLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerLocationLabel: {
    fontSize: 13,
    letterSpacing: 1.1,
    color: 'rgba(226,98,43,0.9)',
    fontWeight: '600',
  },
  cityName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1b2027',
    marginBottom: 6,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tempCenterRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  temperatureHero: {
    fontSize: 96,
    fontWeight: '300',
    color: '#1b2027',
    letterSpacing: -4,
    fontVariant: ['tabular-nums'],
  },
  temperatureDegree: {
    fontSize: 30,
    fontWeight: '400',
    marginTop: 14,
  },
  conditionHero: {
    fontSize: 18,
    color: 'rgba(148,163,184,0.95)',
    marginTop: 6,
    fontWeight: '500',
  },
  heroLoader: {
    marginTop: 12,
  },
  updatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  updatedAt: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(148,163,184,0.95)',
  },
  errorText: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: '500',
    color: '#b6432c',
    lineHeight: 19,
  },
  glassCard: {
    borderRadius: premiumRadii.xl,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderTopColor: GLASS_BORDER_HI,
    backgroundColor: GLASS_BG,
    ...premiumShadow('medium'),
    ...Platform.select<ViewStyle>({
      android: {
        // Sin elevation — el card tiene borderRadius y la elevation
        // en Android es rectangular, no respeta el radio. Es el mismo
        // patrón que usamos en las pantallas de auth.
        elevation: 0,
      },
    }),
    overflow: 'hidden',
  },
  glassTopHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '45%',
    backgroundColor: 'rgba(27,32,39,0.05)',
  },
  glassInner: {
    padding: 18,
  },
  summaryCard: {
    marginBottom: 12,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1b2027',
  },
  summaryChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(226,98,43,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(226,98,43,0.35)',
  },
  summaryChipText: {
    fontSize: 11,
    letterSpacing: 1.6,
    color: ACCENT,
    fontWeight: '700',
  },
  summaryText: {
    fontSize: 14,
    color: 'rgba(27,32,39,0.88)',
    lineHeight: 20,
  },
  summaryFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(226,98,43,0.12)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  summaryPillText: {
    fontSize: 12,
    color: '#1b2027',
    fontWeight: '600',
  },
  summaryPillSoft: {
    backgroundColor: 'rgba(27,32,39,0.08)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  summaryPillTextSoft: {
    fontSize: 12,
    color: 'rgba(27,32,39,0.85)',
    fontWeight: '500',
  },
  weeklySummaryCard: {
    marginBottom: 12,
  },
  weeklySummaryGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  weeklySummaryItem: {
    flex: 1,
    minHeight: 82,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(27,32,39,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(27,32,39,0.1)',
  },
  weeklySummaryDay: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: 'rgba(226,98,43,0.94)',
    textTransform: 'uppercase',
  },
  weeklySummaryTemp: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '700',
    color: '#1b2027',
  },
  weeklySummaryRain: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(27,32,39,0.78)',
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionEyebrow: {
    fontSize: 12,
    color: 'rgba(148,163,184,0.85)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1b2027',
  },
  hourlyCard: {
    marginBottom: 12,
  },
  hourCard: {
    width: 110,
    marginRight: 10,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(27,32,39,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(27,32,39,0.08)',
    alignItems: 'center',
  },
  hourCardActive: {
    backgroundColor: 'rgba(226,98,43,0.18)',
    borderColor: 'rgba(226,98,43,0.35)',
  },
  hourLabel: {
    fontSize: 12,
    color: 'rgba(27,32,39,0.7)',
  },
  hourLabelActive: {
    color: '#1b2027',
    fontWeight: '600',
  },
  hourIcon: {
    marginVertical: 8,
  },
  hourTemp: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1b2027',
  },
  hourRain: {
    fontSize: 12,
    color: 'rgba(226,98,43,0.9)',
    marginTop: 4,
  },
  weeklyCard: {
    marginBottom: 12,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  weekDay: {
    width: 40,
    fontSize: 14,
    color: '#1b2027',
    fontWeight: '500',
  },
  weekIcon: {
    width: 28,
    textAlign: 'center',
  },
  weekRain: {
    width: 40,
    fontSize: 12,
    color: 'rgba(226,98,43,0.9)',
    textAlign: 'center',
  },
  weekTempMin: {
    width: 36,
    fontSize: 13,
    color: 'rgba(27,32,39,0.75)',
    textAlign: 'right',
  },
  weekRangeBar: {
    flex: 1,
    height: 6,
    marginHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.2)',
    overflow: 'hidden',
    position: 'relative',
  },
  weekRangeFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(251,191,36,0.65)',
  },
  weekRangeMarker: {
    position: 'absolute',
    left: '45%',
    width: 6,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#fff7ed',
    top: -2,
  },
  weekTempMax: {
    width: 36,
    fontSize: 13,
    color: '#1b2027',
  },
  mapCard: {
    marginBottom: 12,
  },
  mapPreview: {
    height: 320,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(27,32,39,0.08)',
  },
  mapFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  mapFallbackText: {
    fontSize: 13,
    color: 'rgba(27,32,39,0.8)',
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16,24,38,0.04)',
  },
  mapVignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderRadius: 18,
    shadowColor: '#0b1220',
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  mapLegend: {
    position: 'absolute',
    left: 12,
    top: 12,
    flexDirection: 'column',
    gap: 6,
    backgroundColor: 'rgba(10,14,24,0.65)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
  },
  mapDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  mapLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mapLegendText: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '600',
  },
  mapFabColumn: {
    position: 'absolute',
    right: 12,
    top: 12,
    gap: 8,
  },
  mapFabColumnFullscreen: {
    position: 'absolute',
    right: 18,
    top: 18,
    gap: 10,
  },
  mapFab: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(36,42,52,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  infoGrid: {
    gap: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  infoCard: {
    paddingVertical: 16,
    width: '48%',
  },
  infoCardWide: {
    width: '100%',
    paddingVertical: 16,
  },
  infoTitle: {
    fontSize: 13,
    color: 'rgba(148,163,184,0.9)',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 6,
  },
  infoValue: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1b2027',
    marginBottom: 6,
  },
  infoHint: {
    fontSize: 12,
    color: 'rgba(27,32,39,0.7)',
    lineHeight: 17,
  },
  moonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  moonImageWrap: {
    width: 92,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moonMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  moonMetaItem: {
    flex: 1,
  },
  moonMetaLabel: {
    fontSize: 12,
    color: 'rgba(148,163,184,0.8)',
  },
  moonMetaValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1b2027',
    marginTop: 4,
  },
  moonDivider: {
    width: StyleSheet.hairlineWidth,
    height: 38,
    backgroundColor: 'rgba(148,163,184,0.3)',
  },
  uvBar: {
    height: 6,
    backgroundColor: 'rgba(148,163,184,0.2)',
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 6,
  },
  uvBarFill: {
    width: '55%',
    height: '100%',
    backgroundColor: '#fbbf24',
  },
  mapOverlayFullscreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4,6,12,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  mapFullscreenCard: {
    width: '100%',
    height: '80%',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(27,32,39,0.12)',
  },
  mapFullscreenOverlay: {
    ...StyleSheet.absoluteFillObject,
    padding: 18,
    justifyContent: 'space-between',
  },
  mapLegendLeft: {
    position: 'absolute',
    left: 18,
    top: 18,
    backgroundColor: 'rgba(40,46,56,0.92)',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    width: 160,
  },
  mapLegendTitle: {
    color: '#f1f5f9',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
  },
  mapLegendRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  mapLegendBar: {
    width: 10,
    height: 140,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  mapLegendStop: {
    flex: 1,
    borderRadius: 6,
  },
  mapLegendLabels: {
    gap: 10,
    justifyContent: 'space-between',
  },
  mapLegendScale: {
    color: 'rgba(226,232,240,0.85)',
    fontSize: 12,
    fontWeight: '500',
  },
  mapCloseBtn: {
    position: 'absolute',
    top: 32,
    right: 32,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15,23,42,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
  },
  mapTimeline: {
    flexDirection: 'row',
    gap: 8,
  },
  mapTimelineChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(15,23,42,0.75)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
  },
  mapTimelineText: {
    color: '#1b2027',
    fontSize: 12,
  },
  mapIntensityPanel: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.82)',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    gap: 6,
  },
  dotsCapsuleWrap: {
    alignItems: 'center',
    paddingTop: 6,
    backgroundColor: 'transparent',
    zIndex: 5,
  },
  dotsCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.88)',
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.35)',
  },
  dotActive: {
    width: 22,
    backgroundColor: ACCENT,
  },
});
