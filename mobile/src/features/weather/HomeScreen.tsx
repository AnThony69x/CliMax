import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useCities } from '../../core/cities/CitiesContext';
import { getToken } from '../../core/auth/authStorage';
import type { City } from '../../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type WeatherState = {
  temperature: number;
  weatherCode: number;
  windSpeed: number;
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

const WEATHER_CODES: Record<number, { label: string; icon: string }> = {
  0:  { label: 'Despejado',                   icon: '☀️' },
  1:  { label: 'Mayormente despejado',         icon: '🌤️' },
  2:  { label: 'Parcialmente nublado',         icon: '⛅' },
  3:  { label: 'Nublado',                      icon: '☁️' },
  45: { label: 'Niebla',                       icon: '🌫️' },
  48: { label: 'Niebla con escarcha',          icon: '🌫️' },
  51: { label: 'Llovizna ligera',              icon: '🌦️' },
  53: { label: 'Llovizna',                     icon: '🌦️' },
  55: { label: 'Llovizna intensa',             icon: '🌧️' },
  61: { label: 'Lluvia ligera',                icon: '🌧️' },
  63: { label: 'Lluvia',                       icon: '🌧️' },
  65: { label: 'Lluvia intensa',               icon: '🌧️' },
  71: { label: 'Nieve ligera',                 icon: '🌨️' },
  73: { label: 'Nieve',                        icon: '❄️' },
  75: { label: 'Nieve intensa',                icon: '❄️' },
  80: { label: 'Chubascos ligeros',            icon: '🌦️' },
  81: { label: 'Chubascos',                    icon: '🌧️' },
  82: { label: 'Chubascos intensos',           icon: '⛈️' },
  95: { label: 'Tormenta',                     icon: '⛈️' },
  96: { label: 'Tormenta con granizo',         icon: '⛈️' },
  99: { label: 'Tormenta con granizo fuerte',  icon: '⛈️' },
};

const HOURLY_SLOTS = ['Ahora', '+1h', '+2h', '+3h', '+4h'];

function weatherInfo(code: number | undefined) {
  if (code == null) return { label: 'Cargando...', icon: '⏳' };
  return WEATHER_CODES[code] ?? { label: 'Condición desconocida', icon: '🌡️' };
}

async function apiFetchWeather(latitude: number, longitude: number): Promise<WeatherState> {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) throw new Error('API backend no configurada');
  const res = await fetch(`${apiUrl}/clima?lat=${latitude}&lon=${longitude}`);
  if (!res.ok) throw new Error('No se pudo obtener el clima');
  const data = await res.json();
  const current = data?.current;
  if (!current) throw new Error('Datos del clima incompletos');
  return {
    temperature: current.temperature_2m,
    weatherCode: current.weather_code,
    windSpeed: current.wind_speed_10m,
  };
}

async function apiFetchAddress(latitude: number, longitude: number): Promise<string | null> {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) return null;
  const res = await fetch(`${apiUrl}/geocode?lat=${latitude}&lon=${longitude}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data?.display_name ?? null;
}

async function persistLocation(
  latitude: number,
  longitude: number,
  payload: { address: string | null; temperature: number; weatherCode: number; windSpeed: number }
) {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) return;
  try {
    const token = await getToken();
    await fetch(`${apiUrl}/location`, {
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

/* ─────────────────────────────────────────────
   WeatherSlide — una tarjeta del carrusel
───────────────────────────────────────────── */
function WeatherSlide({
  slide,
  onRefresh,
  isGPS,
}: {
  slide: SlideData;
  onRefresh?: () => void;
  isGPS: boolean;
}) {
  const info = weatherInfo(slide.weather?.weatherCode);
  const refreshing = isGPS && slide.status === 'loading';

  return (
    <ScrollView
      style={{ width: SCREEN_WIDTH }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.slideScroll}
      refreshControl={
        isGPS ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#90cdfd"
            colors={['#90cdfd']}
          />
        ) : undefined
      }
    >
      {/* Hero */}
      <View style={styles.heroCard}>
        <Text style={styles.locationLabel}>
          {isGPS ? 'UBICACIÓN ACTUAL' : 'CIUDAD GUARDADA'}
        </Text>
        <Text style={styles.locationName} numberOfLines={2}>
          {slide.cityName}
        </Text>

        <View style={styles.heroRow}>
          <View style={styles.heroLeft}>
            <Text style={styles.temperature}>
              {slide.weather != null ? `${slide.weather.temperature}°` : '--°'}
            </Text>
            <Text style={styles.condition}>{info.label}</Text>

            <View style={styles.pillRow}>
              <View style={styles.pill}>
                <Text style={styles.pillText}>
                  💨 {slide.weather?.windSpeed ?? '--'} km/h
                </Text>
              </View>
              {slide.coords && (
                <View style={styles.pill}>
                  <Text style={styles.pillText}>
                    📍 {slide.coords.latitude.toFixed(2)}, {slide.coords.longitude.toFixed(2)}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <Text style={styles.heroEmoji}>{info.icon}</Text>
        </View>

        {slide.status === 'loading' && !isGPS && (
          <ActivityIndicator color="#90cdfd" style={{ marginTop: 16 }} />
        )}
        {slide.updatedAt && (
          <Text style={styles.updatedAt}>Actualizado: {slide.updatedAt}</Text>
        )}
        {slide.message ? <Text style={styles.errorText}>{slide.message}</Text> : null}
      </View>

      {/* Pronóstico por hora (indicativo) */}
      <View style={styles.glassCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Pronóstico por hora</Text>
          <Text style={styles.cardHeaderIcon}>🕐</Text>
        </View>
        {HOURLY_SLOTS.map((slot, i) => (
          <View
            key={slot}
            style={[styles.hourRow, i === 0 && styles.hourRowActive]}
          >
            <Text style={[styles.hourTime, i === 0 && styles.hourTimeActive]}>{slot}</Text>
            <Text style={styles.hourIcon}>{info.icon}</Text>
            <Text style={styles.hourTemp}>
              {slide.weather != null
                ? `${Math.round(slide.weather.temperature + i * -0.5)}°`
                : '--°'}
            </Text>
          </View>
        ))}
      </View>

      {/* Coordenadas */}
      {slide.coords && (
        <View style={styles.glassCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Coordenadas GPS</Text>
            <Text style={styles.cardHeaderIcon}>🛰️</Text>
          </View>
          <View style={styles.coordRow}>
            <View style={styles.coordItem}>
              <Text style={styles.coordLabel}>LATITUD</Text>
              <Text style={styles.coordValue}>{slide.coords.latitude.toFixed(6)}</Text>
            </View>
            <View style={styles.coordDivider} />
            <View style={styles.coordItem}>
              <Text style={styles.coordLabel}>LONGITUD</Text>
              <Text style={styles.coordValue}>{slide.coords.longitude.toFixed(6)}</Text>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

/* ─────────────────────────────────────────────
   HomeScreen principal
───────────────────────────────────────────── */
export default function HomeScreen() {
  const { savedCities, removeCity } = useCities();
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
    updateGpsSlide({ status: 'loading', message: '' });
    try {
      const [weather, address] = await Promise.all([
        apiFetchWeather(latitude, longitude),
        apiFetchAddress(latitude, longitude),
      ]);
      const cityName = address
        ? address.split(',').slice(0, 2).join(',').trim()
        : `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
      updateGpsSlide({
        coords: { latitude, longitude },
        weather,
        cityName,
        updatedAt: new Date().toLocaleTimeString(),
        status: 'ready',
        message: '',
      });
      await persistLocation(latitude, longitude, {
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

  // GPS watcher
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      updateGpsSlide({ status: 'loading' });
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        updateGpsSlide({ status: 'error', message: 'Permiso de ubicación denegado' });
        return;
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 15000, distanceInterval: 30 },
        (loc) => loadGpsWeather(loc.coords.latitude, loc.coords.longitude)
      );
    })();
    return () => { sub?.remove(); };
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Botón eliminar ciudad (solo en slides no-GPS) */}
      {!isActiveGPS && activeSlide && (
        <Pressable
          style={styles.removeBtn}
          onPress={() => {
            const city = savedCities[activeIndex - 1];
            if (!city) return;
            removeCity(city.id);
            const newIdx = Math.max(0, activeIndex - 1);
            setActiveIndex(newIdx);
            scrollRef.current?.scrollTo({ x: newIdx * SCREEN_WIDTH, animated: true });
          }}
        >
          <Text style={styles.removeBtnText}>✕</Text>
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
        <View style={styles.dotsRow}>
          {allSlides.map((_, i) => (
            <Pressable
              key={i}
              style={[styles.dot, i === activeIndex && styles.dotActive]}
              onPress={() => {
                setActiveIndex(i);
                scrollRef.current?.scrollTo({ x: i * SCREEN_WIDTH, animated: true });
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const GLASS_BG = 'rgba(255,255,255,0.08)';
const GLASS_BORDER = 'rgba(255,255,255,0.14)';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111316',
  },
  slideScroll: {
    paddingTop: 60,
    paddingBottom: 100,
    paddingHorizontal: 20,
    gap: 16,
  },

  /* ── Botón eliminar ── */
  removeBtn: {
    position: 'absolute',
    top: 52,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255,100,100,0.2)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,100,100,0.35)',
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    color: '#ffb4ab',
    fontSize: 14,
    fontWeight: '600',
  },

  /* ── Hero ── */
  heroCard: {
    backgroundColor: 'rgba(2,87,129,0.35)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    padding: 28,
  },
  locationLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 6,
  },
  locationName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 20,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroLeft: { flex: 1 },
  temperature: {
    fontSize: 80,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 88,
  },
  condition: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 4,
    marginBottom: 16,
  },
  heroEmoji: {
    fontSize: 80,
    marginLeft: 8,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: { fontSize: 13, color: '#FFFFFF' },
  updatedAt: {
    marginTop: 16,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    color: '#ffb4ab',
  },

  /* ── Glass Card ── */
  glassCard: {
    backgroundColor: GLASS_BG,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    padding: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#FFFFFF' },
  cardHeaderIcon: { fontSize: 20 },

  /* ── Hourly ── */
  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  hourRowActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  hourTime: { fontSize: 15, color: 'rgba(255,255,255,0.6)', width: 60 },
  hourTimeActive: { color: '#FFFFFF', fontWeight: '600' },
  hourIcon: { fontSize: 22, flex: 1, textAlign: 'center' },
  hourTemp: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    width: 44,
    textAlign: 'right',
  },

  /* ── Coordenadas ── */
  coordRow: { flexDirection: 'row', alignItems: 'center' },
  coordItem: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  coordDivider: {
    width: 1,
    height: 40,
    backgroundColor: GLASS_BORDER,
    marginHorizontal: 12,
  },
  coordLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 6,
  },
  coordValue: { fontSize: 16, fontWeight: '600', color: '#90cdfd' },

  /* ── Dots ── */
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 16,
    paddingTop: 8,
    backgroundColor: '#111316',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: {
    width: 20,
    backgroundColor: '#90cdfd',
  },
});
