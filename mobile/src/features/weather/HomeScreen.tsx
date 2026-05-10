import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCities } from '../../core/cities/CitiesContext';
import { getToken } from '../../core/auth/authStorage';
import type { City } from '../../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type WeatherState = {
  temperature: number;
  weatherCode: number;
  windSpeed: number;
  tempMax?: number | null;
  tempMin?: number | null;
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

const SURFACE_DEEP = '#0c1222';
const ACCENT = '#38bdf8';
const ACCENT_SOFT = '#7dd3fc';


function weatherInfo(code: number | undefined) {
  if (code == null) return { label: 'Cargando...', icon: '⏳' };
  return WEATHER_CODES[code] ?? { label: 'Condición desconocida', icon: '🌡️' };
}

function formatTempRounded(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return '--';
  return `${Math.round(v)}`;
}

/** Icono de “posición actual” (GPS): mira de puntería, sin pin de mapa. */
function gpsLocationIconProps() {
  if (Platform.OS === 'ios') {
    return { name: 'locate' as const, size: 22 };
  }
  return { name: 'locate-outline' as const, size: 22 };
}

async function apiFetchWeather(latitude: number, longitude: number): Promise<WeatherState> {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) throw new Error('API backend no configurada');
  const res = await fetch(`${apiUrl}/clima?lat=${latitude}&lon=${longitude}`);
  if (!res.ok) throw new Error('No se pudo obtener el clima');
  const data = await res.json();
  const current = data?.current;
  if (!current) throw new Error('Datos del clima incompletos');
  const daily = data?.daily as Record<string, number[] | undefined> | undefined;
  const tempMaxRaw = daily?.temperature_2m_max?.[0];
  const tempMinRaw = daily?.temperature_2m_min?.[0];
  return {
    temperature: current.temperature_2m,
    weatherCode: current.weather_code,
    windSpeed: current.wind_speed_10m,
    tempMax: typeof tempMaxRaw === 'number' ? tempMaxRaw : null,
    tempMin: typeof tempMinRaw === 'number' ? tempMinRaw : null,
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
  const insets = useSafeAreaInsets();
  const info = weatherInfo(slide.weather?.weatherCode);
  const refreshing = isGPS && slide.status === 'loading';
  const bottomPad = Math.max(insets.bottom, 12) + 84;

  return (
    <ScrollView
      style={{ width: SCREEN_WIDTH }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.slideScroll, { paddingTop: insets.top + 12, paddingBottom: bottomPad }]}
      refreshControl={
        isGPS ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={ACCENT_SOFT}
            colors={[ACCENT_SOFT]}
          />
        ) : undefined
      }
    >
      {/* Hero: temperatura arriba (fija); el nombre largo ya no la empuja */}
      <View style={styles.heroCard}>
        {isGPS ? (
          <View style={styles.gpsIconOnly}>
            <Ionicons {...gpsLocationIconProps()} color={ACCENT} />
          </View>
        ) : null}

        <View style={styles.heroMainRow}>
          <View style={styles.heroTempColumn}>
            <View style={styles.tempRow}>
              <Text
                style={styles.temperature}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {slide.weather != null ? Math.round(slide.weather.temperature) : '--'}
              </Text>
              <Text style={styles.degreeMark}>°</Text>
            </View>
          </View>
          <View style={styles.heroEmojiWrap} accessibilityLabel={`Icono ${info.label}`}>
            <Text style={styles.heroEmoji}>{info.icon}</Text>
          </View>
        </View>

        <Text style={styles.locationName} numberOfLines={2} ellipsizeMode="tail">
          {slide.cityName}
        </Text>
        <Text style={styles.condition}>{info.label}</Text>

        <View style={styles.pillRow}>
          <View style={styles.pill}>
            <Ionicons name="speedometer-outline" size={15} color={ACCENT} style={styles.pillIcon} />
            <Text style={styles.pillText}>{slide.weather?.windSpeed ?? '--'} km/h</Text>
          </View>
          <View style={[styles.pill, styles.pillMuted]}>
            <Ionicons name="trending-up-outline" size={15} color="#fda4af" style={styles.pillIcon} />
            <Text style={styles.pillTextSecondary}>Máx {formatTempRounded(slide.weather?.tempMax)}°</Text>
          </View>
          <View style={[styles.pill, styles.pillMuted]}>
            <Ionicons name="trending-down-outline" size={15} color={ACCENT_SOFT} style={styles.pillIcon} />
            <Text style={styles.pillTextSecondary}>Mín {formatTempRounded(slide.weather?.tempMin)}°</Text>
          </View>
        </View>

        {slide.status === 'loading' && !isGPS && (
          <ActivityIndicator color={ACCENT_SOFT} style={styles.heroLoader} />
        )}
        {slide.updatedAt && (
          <View style={styles.updatedRow}>
            <Ionicons name="time-outline" size={14} color="rgba(148,163,184,0.9)" />
            <Text style={styles.updatedAt}>Actualizado · {slide.updatedAt}</Text>
          </View>
        )}
        {slide.message ? <Text style={styles.errorText}>{slide.message}</Text> : null}
      </View>

      {/* Pronóstico por hora (indicativo) */}
      <View style={styles.glassCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderTitles}>
            <View style={styles.cardTitleIconWrap}>
              <Ionicons name="today-outline" size={18} color={ACCENT} />
            </View>
            <View>
              <Text style={styles.cardEyebrow}>Próximas horas</Text>
              <Text style={styles.cardTitle}>Por hora</Text>
            </View>
          </View>
          <View style={styles.cardHeaderAccent} />
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
        <View style={[styles.glassCard, styles.glassCardMuted]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderTitles}>
              <View style={styles.cardTitleIconWrap}>
                <Ionicons name="map-outline" size={18} color={ACCENT} />
              </View>
              <View>
                <Text style={styles.cardEyebrow}>Referencia</Text>
                <Text style={styles.cardTitle}>Coordenadas GPS</Text>
              </View>
            </View>
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
  const insets = useSafeAreaInsets();
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
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
          <Ionicons name="trash-outline" size={17} color="#fecaca" />
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
        <View style={[styles.dotsCapsuleWrap, { paddingBottom: Math.max(insets.bottom, 8) + 6 }]}>
          <View style={styles.dotsCapsule}>
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
    backgroundColor: SURFACE_DEEP,
    overflow: 'hidden',
  },
  bgGlowTop: {
    position: 'absolute',
    top: -90,
    left: -100,
    width: 340,
    height: 340,
    borderRadius: 999,
    backgroundColor: 'rgba(2,87,129,0.26)',
  },
  bgGlowBottom: {
    position: 'absolute',
    bottom: -80,
    right: -100,
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: 'rgba(56,189,248,0.09)',
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
    elevation: 6,
  },

  /* ── Hero ── */
  heroCard: {
    backgroundColor: 'rgba(15,23,42,0.78)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.22)',
    paddingVertical: 24,
    paddingHorizontal: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 10,
  },
  gpsIconOnly: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    paddingVertical: 2,
    paddingRight: 8,
  },
  locationName: {
    fontSize: 21,
    fontWeight: '700',
    color: '#f8fafc',
    letterSpacing: -0.35,
    marginBottom: 8,
    lineHeight: 27,
    maxWidth: '100%',
  },
  heroMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 12,
  },
  heroTempColumn: {
    flexShrink: 0,
    flexGrow: 0,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    minWidth: 108,
    maxWidth: '58%',
    paddingRight: 8,
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexShrink: 0,
  },
  temperature: {
    fontSize: 76,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: -4,
    lineHeight: 80,
    fontVariant: ['tabular-nums'],
  },
  degreeMark: {
    fontSize: 28,
    fontWeight: '600',
    color: ACCENT,
    marginTop: 10,
    marginLeft: 2,
  },
  condition: {
    fontSize: 16,
    color: 'rgba(148,163,184,0.95)',
    marginTop: 0,
    marginBottom: 12,
    lineHeight: 22,
    fontWeight: '500',
  },
  heroEmojiWrap: {
    flexShrink: 0,
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: 'rgba(56,189,248,0.10)',
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmoji: { fontSize: 52 },

  heroLoader: {
    marginTop: 14,
    alignSelf: 'flex-start',
  },
  updatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56,189,248,0.08)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: '100%',
  },
  pillMuted: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: GLASS_BORDER,
  },
  pillIcon: {
    marginRight: 6,
  },
  pillText: { fontSize: 13, fontWeight: '600', color: '#f8fafc' },
  pillTextSecondary: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(241,245,249,0.88)',
  },
  updatedAt: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(148,163,184,0.95)',
  },
  errorText: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '500',
    color: '#fecaca',
    lineHeight: 19,
  },

  glassCard: {
    backgroundColor: GLASS_BG,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    paddingVertical: 16,
    paddingHorizontal: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 4,
  },
  glassCardMuted: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  cardHeaderTitles: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  cardTitleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.15,
    color: 'rgba(148,163,184,0.85)',
    textTransform: 'uppercase',
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#f8fafc', marginTop: 3 },
  cardHeaderAccent: {
    width: 4,
    height: 40,
    borderRadius: 4,
    backgroundColor: ACCENT,
    opacity: 0.6,
    marginRight: 2,
  },

  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginHorizontal: -4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  hourRowActive: {
    backgroundColor: 'rgba(56,189,248,0.08)',
    borderColor: 'rgba(56,189,248,0.28)',
  },
  hourTime: { fontSize: 14, color: 'rgba(148,163,184,0.95)', width: 54, fontWeight: '500' },
  hourTimeActive: { color: '#f8fafc', fontWeight: '700' },
  hourIcon: { fontSize: 22, flex: 1, textAlign: 'center' },
  hourTemp: {
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: '#f8fafc',
    width: 42,
    textAlign: 'right',
  },

  coordRow: { flexDirection: 'row', alignItems: 'center' },
  coordItem: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  coordDivider: {
    width: StyleSheet.hairlineWidth,
    height: 44,
    backgroundColor: GLASS_BORDER,
    marginHorizontal: 10,
  },
  coordLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: 'rgba(148,163,184,0.75)',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  coordValue: {
    fontSize: 13,
    fontWeight: '600',
    color: ACCENT_SOFT,
    fontVariant: ['tabular-nums'],
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
