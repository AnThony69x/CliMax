export interface User {
  id: string;
  email?: string;
  phone?: string;
  name?: string;
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Weather {
  temperature: number;
  weather_code: number;
  wind_speed: number;
  humidity?: number;
  pressure?: number;
}

export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  is_read: boolean;
  created_at: string;
  location?: string;
  recommendations?: string[];
}

export interface City {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
}