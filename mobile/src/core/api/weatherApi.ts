const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:8000';

export const API_URL = `${API_BASE_URL}/api`;

export async function fetchWeather(lat: number, lon: number) {
  const response = await fetch(`${API_URL}/clima?lat=${lat}&lon=${lon}`);
  if (!response.ok) throw new Error('Error fetching weather');
  return response.json();
}

export async function fetchAddress(lat: number, lon: number) {
  const response = await fetch(`${API_URL}/geocode?lat=${lat}&lon=${lon}`);
  if (!response.ok) throw new Error('Error fetching address');
  return response.json();
}

export async function saveLocation(data: {
  latitude: number;
  longitude: number;
  address?: string;
  temperature?: number;
  weather_code?: number;
  wind_speed?: number;
}, token?: string | null) {
  const response = await fetch(`${API_URL}/location`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      ...data,
      captured_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error('Error saving location');
  return response.json();
}

export async function getProfile(token: string) {
  const response = await fetch(`${API_URL}/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Error fetching profile');
  return response.json();
}

export async function updateProfile(data: { name?: string; avatar_url?: string }, token: string) {
  const response = await fetch(`${API_URL}/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Error updating profile');
  return response.json();
}