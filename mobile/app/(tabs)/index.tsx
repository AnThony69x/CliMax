import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { clearToken, getToken } from '../../src/core/auth/authStorage';

type WeatherState = {
  temperature: number;
  weatherCode: number;
  windSpeed: number;
};

export default function HomeScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [weather, setWeather] = useState<WeatherState | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);

  const weatherLabel = useMemo(() => {
    if (!weather) return '';
    const map: Record<number, string> = {
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
    return map[weather.weatherCode] ?? 'Condicion desconocida';
  }, [weather]);

  const fetchWeather = async (latitude: number, longitude: number) => {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!apiUrl) {
      throw new Error('API backend no configurada');
    }
    const response = await fetch(`${apiUrl}/clima?lat=${latitude}&lon=${longitude}`);
    if (!response.ok) {
      throw new Error('No se pudo obtener el clima');
    }
    const data = await response.json();
    const current = data?.current;
    if (!current) {
      throw new Error('Datos del clima incompletos');
    }
    return {
      temperature: current.temperature_2m,
      weatherCode: current.weather_code,
      windSpeed: current.wind_speed_10m,
    };
  };

  const fetchAddress = async (latitude: number, longitude: number) => {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!apiUrl) {
      throw new Error('API backend no configurada');
    }
    const response = await fetch(`${apiUrl}/geocode?lat=${latitude}&lon=${longitude}`);
    if (!response.ok) {
      throw new Error('No se pudo obtener la ubicacion en texto');
    }
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
      console.warn('No se pudo guardar la ubicacion', error);
    }
  };

  const updateFromCoords = async (latitude: number, longitude: number) => {
    setCoords({ latitude, longitude });
    const [weatherInfo, addressInfo] = await Promise.all([
      fetchWeather(latitude, longitude),
      fetchAddress(latitude, longitude),
    ]);
    setWeather(weatherInfo);
    setAddress(addressInfo);
    setUpdatedAt(new Date().toLocaleTimeString());
    await persistLocation(latitude, longitude, {
      address: addressInfo,
      temperature: weatherInfo.temperature,
      weatherCode: weatherInfo.weatherCode,
      windSpeed: weatherInfo.windSpeed,
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
    } catch (error) {
      setStatus('error');
      setMessage('No se pudo actualizar la ubicacion');
    }
  };

  const handleLogout = async () => {
    await clearToken();
    router.replace('/welcome');
  };

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    const start = async () => {
      setStatus('loading');
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setStatus('error');
        setMessage('Permiso de ubicacion denegado');
        return;
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 15000,
          distanceInterval: 30,
        },
        async (location) => {
          try {
            await updateFromCoords(location.coords.latitude, location.coords.longitude);
            setStatus('ready');
          } catch (error) {
            setStatus('error');
            setMessage('No se pudo obtener el clima');
          }
        }
      );
    };

    start();

    return () => {
      subscription?.remove();
    };
  }, []);
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Clima en tiempo real</Text>
        <Text style={styles.subtitle}>Ubicacion y datos actuales</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ubicacion</Text>
          {coords ? (
            <>
              <Text style={styles.value}>
                {coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)}
              </Text>
              {address ? (
                <Text style={styles.placeholder}>{address}</Text>
              ) : (
                <Text style={styles.placeholder}>Buscando direccion...</Text>
              )}
            </>
          ) : (
            <Text style={styles.placeholder}>Esperando ubicacion...</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Clima</Text>
          {weather ? (
            <>
              <Text style={styles.value}>{weather.temperature}°C</Text>
              <Text style={styles.placeholder}>{weatherLabel}</Text>
              <Text style={styles.meta}>Viento: {weather.windSpeed} km/h</Text>
            </>
          ) : (
            <Text style={styles.placeholder}>Cargando clima...</Text>
          )}
        </View>

        {updatedAt ? (
          <Text style={styles.meta}>Actualizado: {updatedAt}</Text>
        ) : null}

        {message ? <Text style={styles.error}>{message}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            status === 'loading' && styles.buttonDisabled,
            pressed && status !== 'loading' && styles.buttonPressed,
          ]}
          disabled={status === 'loading'}
          onPress={refreshOnce}
        >
          <Text style={styles.buttonText}>
            {status === 'loading' ? 'Actualizando...' : 'Actualizar ahora'}
          </Text>
        </Pressable>

        <Pressable style={styles.linkButton} onPress={handleLogout}>
          <Text style={styles.linkText}>Cerrar sesion</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F1F5F2',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    shadowColor: '#0B1411',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0B1411',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#52655A',
  },
  section: {
    marginTop: 18,
  },
  sectionTitle: {
    fontSize: 12,
    color: '#52655A',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  value: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: '700',
    color: '#1F3D2E',
  },
  placeholder: {
    marginTop: 8,
    fontSize: 14,
    color: '#6E7F77',
  },
  meta: {
    marginTop: 6,
    fontSize: 12,
    color: '#6E7F77',
  },
  error: {
    marginTop: 10,
    fontSize: 12,
    color: '#A33A3A',
  },
  button: {
    marginTop: 18,
    backgroundColor: '#2A7A4B',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  linkButton: {
    marginTop: 12,
    alignItems: 'center',
  },
  linkText: {
    color: '#52655A',
    fontSize: 14,
  },
});
