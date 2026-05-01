import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getToken } from '../../core/auth/authStorage';

type WeatherState = {
  temperature: number;
  weatherCode: number;
  windSpeed: number;
};

const WEATHER_CODES: Record<number, { label: string; icon: string }> = {
  0:  { label: 'Despejado',               icon: '☀️' },
  1:  { label: 'Mayormente despejado',     icon: '🌤️' },
  2:  { label: 'Parcialmente nublado',     icon: '⛅' },
  3:  { label: 'Nublado',                  icon: '☁️' },
  45: { label: 'Niebla',                   icon: '🌫️' },
  48: { label: 'Niebla con escarcha',      icon: '🌫️' },
  51: { label: 'Llovizna ligera',          icon: '🌦️' },
  53: { label: 'Llovizna',                 icon: '🌦️' },
  55: { label: 'Llovizna intensa',         icon: '🌧️' },
  61: { label: 'Lluvia ligera',            icon: '🌧️' },
  63: { label: 'Lluvia',                   icon: '🌧️' },
  65: { label: 'Lluvia intensa',           icon: '🌧️' },
  71: { label: 'Nieve ligera',             icon: '🌨️' },
  73: { label: 'Nieve',                    icon: '❄️' },
  75: { label: 'Nieve intensa',            icon: '❄️' },
  80: { label: 'Chubascos ligeros',        icon: '🌦️' },
  81: { label: 'Chubascos',               icon: '🌧️' },
  82: { label: 'Chubascos intensos',       icon: '⛈️' },
  95: { label: 'Tormenta',                 icon: '⛈️' },
  96: { label: 'Tormenta con granizo',     icon: '⛈️' },
  99: { label: 'Tormenta con granizo fuerte', icon: '⛈️' },
};

const HOURLY_SLOTS = ['Ahora', '+1h', '+2h', '+3h', '+4h'];

export default function HomeScreen() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [weather, setWeather] = useState<WeatherState | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);

  const weatherInfo = useMemo(() => {
    if (!weather) return { label: 'Cargando...', icon: '⏳' };
    return WEATHER_CODES[weather.weatherCode] ?? { label: 'Condición desconocida', icon: '🌡️' };
  }, [weather]);

  const fetchWeather = async (latitude: number, longitude: number) => {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!apiUrl) throw new Error('API backend no configurada');
    const response = await fetch(`${apiUrl}/clima?lat=${latitude}&lon=${longitude}`);
    if (!response.ok) throw new Error('No se pudo obtener el clima');
    const data = await response.json();
    const current = data?.current;
    if (!current) throw new Error('Datos del clima incompletos');
    return {
      temperature: current.temperature_2m,
      weatherCode: current.weather_code,
      windSpeed: current.wind_speed_10m,
    };
  };

  const fetchAddress = async (latitude: number, longitude: number) => {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!apiUrl) throw new Error('API backend no configurada');
    const response = await fetch(`${apiUrl}/geocode?lat=${latitude}&lon=${longitude}`);
    if (!response.ok) throw new Error('No se pudo obtener la ubicación en texto');
    const data = await response.json();
    return data?.display_name ?? null;
  };

  const persistLocation = async (
    latitude: number,
    longitude: number,
    payload: {
      address: string | null;
      temperature: number | null;
      weatherCode: number | null;
      windSpeed: number | null;
    }
  ) => {
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
    } catch (error) {
      console.warn('No se pudo guardar la ubicación', error);
    }
  };

  const updateFromCoords = async (latitude: number, longitude: number) => {
    setCoords({ latitude, longitude });
    const [weatherData, addressData] = await Promise.all([
      fetchWeather(latitude, longitude),
      fetchAddress(latitude, longitude),
    ]);
    setWeather(weatherData);
    setAddress(addressData);
    setUpdatedAt(new Date().toLocaleTimeString());
    await persistLocation(latitude, longitude, {
      address: addressData,
      temperature: weatherData.temperature,
      weatherCode: weatherData.weatherCode,
      windSpeed: weatherData.windSpeed,
    });
  };

  const refreshOnce = async () => {
    setStatus('loading');
    setMessage('');
    try {
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await updateFromCoords(current.coords.latitude, current.coords.longitude);
      setStatus('ready');
    } catch {
      setStatus('error');
      setMessage('No se pudo actualizar la ubicación');
    }
  };

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    const start = async () => {
      setStatus('loading');
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setStatus('error');
        setMessage('Permiso de ubicación denegado');
        return;
      }

      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 15000, distanceInterval: 30 },
        async (location) => {
          try {
            await updateFromCoords(location.coords.latitude, location.coords.longitude);
            setStatus('ready');
          } catch {
            setStatus('error');
            setMessage('No se pudo obtener el clima');
          }
        }
      );
    };

    start();
    return () => { subscription?.remove(); };
  }, []);

  const cityName = address
    ? address.split(',').slice(0, 2).join(',').trim()
    : 'Buscando ubicación...';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Hero Card ── */}
        <View style={styles.heroCard}>
          <Text style={styles.locationLabel}>UBICACIÓN ACTUAL</Text>
          <Text style={styles.locationName} numberOfLines={2}>{cityName}</Text>

          <View style={styles.heroRow}>
            <View style={styles.heroLeft}>
              <Text style={styles.temperature}>
                {weather != null ? `${weather.temperature}°` : '--°'}
              </Text>
              <Text style={styles.condition}>{weatherInfo.label}</Text>

              <View style={styles.pillRow}>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>💨 {weather?.windSpeed ?? '--'} km/h</Text>
                </View>
                {coords && (
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>
                      📍 {coords.latitude.toFixed(2)}, {coords.longitude.toFixed(2)}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <Text style={styles.heroEmoji}>{weatherInfo.icon}</Text>
          </View>

          {updatedAt && (
            <Text style={styles.updatedAt}>Actualizado: {updatedAt}</Text>
          )}
          {message ? <Text style={styles.errorText}>{message}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.refreshBtn,
              status === 'loading' && styles.refreshBtnDisabled,
              pressed && { opacity: 0.75 },
            ]}
            onPress={refreshOnce}
            disabled={status === 'loading'}
          >
            <Text style={styles.refreshBtnText}>
              {status === 'loading' ? 'Actualizando...' : '↻  Actualizar ahora'}
            </Text>
          </Pressable>
        </View>

        {/* ── Pronóstico por hora (indicativo) ── */}
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
              <Text style={[styles.hourTime, i === 0 && styles.hourTimeActive]}>
                {slot}
              </Text>
              <Text style={styles.hourIcon}>{weatherInfo.icon}</Text>
              <Text style={styles.hourTemp}>
                {weather != null ? `${Math.round(weather.temperature + (i * -0.5))}°` : '--°'}
              </Text>
            </View>
          ))}
        </View>

        {/* ── Coordenadas detalladas ── */}
        {coords && (
          <View style={styles.glassCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Coordenadas GPS</Text>
              <Text style={styles.cardHeaderIcon}>🛰️</Text>
            </View>
            <View style={styles.coordRow}>
              <View style={styles.coordItem}>
                <Text style={styles.coordLabel}>LATITUD</Text>
                <Text style={styles.coordValue}>{coords.latitude.toFixed(6)}</Text>
              </View>
              <View style={styles.coordDivider} />
              <View style={styles.coordItem}>
                <Text style={styles.coordLabel}>LONGITUD</Text>
                <Text style={styles.coordValue}>{coords.longitude.toFixed(6)}</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
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
  scrollContent: {
    paddingTop: 60,
    paddingBottom: 32,
    paddingHorizontal: 20,
    gap: 16,
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
  heroLeft: {
    flex: 1,
  },
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
  pillText: {
    fontSize: 13,
    color: '#FFFFFF',
  },
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
  refreshBtn: {
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    paddingVertical: 14,
    alignItems: 'center',
  },
  refreshBtnDisabled: {
    opacity: 0.5,
  },
  refreshBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },

  /* ── Glass Card genérico ── */
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
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cardHeaderIcon: {
    fontSize: 20,
  },

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
  hourTime: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    width: 60,
  },
  hourTimeActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  hourIcon: {
    fontSize: 22,
    flex: 1,
    textAlign: 'center',
  },
  hourTemp: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    width: 44,
    textAlign: 'right',
  },

  /* ── Coordenadas ── */
  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  coordItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
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
  coordValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#90cdfd',
  },
});
