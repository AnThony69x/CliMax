import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

export type PreferenceKey =
  | 'communityMentions'
  | 'weeklySummary'
  | 'dataSaver'
  | 'preciseLocation';

export type AccountPreferences = Record<PreferenceKey, boolean>;

export const ACCOUNT_PREFS_STORAGE_KEY = 'climax_account_preferences';

export const DEFAULT_ACCOUNT_PREFERENCES: AccountPreferences = {
  communityMentions: true,
  weeklySummary: false,
  dataSaver: false,
  preciseLocation: true,
};

export async function loadAccountPreferences(): Promise<AccountPreferences> {
  try {
    const value = await AsyncStorage.getItem(ACCOUNT_PREFS_STORAGE_KEY);
    if (!value) return DEFAULT_ACCOUNT_PREFERENCES;
    const parsed = JSON.parse(value) as Partial<AccountPreferences>;
    return { ...DEFAULT_ACCOUNT_PREFERENCES, ...parsed };
  } catch {
    return DEFAULT_ACCOUNT_PREFERENCES;
  }
}

export async function saveAccountPreferences(next: AccountPreferences): Promise<void> {
  await AsyncStorage.setItem(ACCOUNT_PREFS_STORAGE_KEY, JSON.stringify(next));
}

export function useAccountPreferences() {
  const [preferences, setPreferences] = useState<AccountPreferences>(DEFAULT_ACCOUNT_PREFERENCES);

  const refreshPreferences = useCallback(() => {
    let mounted = true;
    loadAccountPreferences().then((loaded) => {
      if (mounted) setPreferences(loaded);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return refreshPreferences();
  }, [refreshPreferences]);

  useFocusEffect(refreshPreferences);

  return preferences;
}

export function applyLocationPrecision(
  latitude: number,
  longitude: number,
  preciseLocation: boolean,
) {
  if (preciseLocation) return { latitude, longitude };
  return {
    latitude: Number(latitude.toFixed(2)),
    longitude: Number(longitude.toFixed(2)),
  };
}
