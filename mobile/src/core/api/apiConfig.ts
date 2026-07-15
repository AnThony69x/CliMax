import Constants from 'expo-constants';

const DEFAULT_API_BASE_URL = 'http://localhost:8000';

function stripApiSuffix(value: string) {
  return value.trim().replace(/\/api\/?$/, '').replace(/\/$/, '');
}

function isUsableAbsoluteUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return Boolean(parsed.protocol.match(/^https?:$/) && parsed.hostname);
  } catch {
    return false;
  }
}

function getExpoHostUrl() {
  const constants = Constants as typeof Constants & {
    manifest?: { debuggerHost?: string };
    manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
  };
  const hostUri =
    Constants.expoConfig?.hostUri ??
    constants.manifest2?.extra?.expoClient?.hostUri ??
    constants.manifest?.debuggerHost;

  const host = hostUri?.split(':')[0];
  if (!host || host === '0.0.0.0') return null;
  return `http://${host}:8000`;
}

function resolveApiBaseUrl() {
  const configuredUrl = stripApiSuffix(process.env.EXPO_PUBLIC_API_URL ?? '');
  const candidates = [configuredUrl, getExpoHostUrl(), DEFAULT_API_BASE_URL];
  const apiBaseUrl = candidates.find(isUsableAbsoluteUrl) ?? DEFAULT_API_BASE_URL;
  return stripApiSuffix(apiBaseUrl);
}

export const API_BASE_URL = resolveApiBaseUrl();
export const API_URL = `${API_BASE_URL}/api`;
