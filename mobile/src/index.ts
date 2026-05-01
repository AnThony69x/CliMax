// Componentes compartidos
export { Card, Button, Input, Badge } from './components';

// Hooks
export { useWeather, useAuth } from './hooks';

// Tipos
export type { User, Weather, Location, Alert, City } from './types';

// Auth
export { saveToken, getToken, clearToken } from './core/auth/authStorage';
export { supabase, signInWithPassword, signUp, signOut, getSession, getAccessToken } from './core/auth/supabaseClient';

// API
export { API_URL, fetchWeather, fetchAddress, saveLocation, getProfile, updateProfile } from './core/api/weatherApi';
