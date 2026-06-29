import { saveToken } from './authStorage';
import { supabase } from './supabaseClient';

function decodeParam(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function collectParams(source: string, params: Record<string, string>) {
  source
    .replace(/^[?#]/, '')
    .split('&')
    .filter(Boolean)
    .forEach((pair) => {
      const [rawKey, ...rawValue] = pair.split('=');
      if (!rawKey) return;
      params[decodeParam(rawKey)] = decodeParam(rawValue.join('='));
    });
}

function getAuthParamsFromUrl(url: string) {
  const params: Record<string, string> = {};
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');

  if (queryIndex >= 0) {
    const queryEnd = hashIndex >= 0 ? hashIndex : url.length;
    collectParams(url.slice(queryIndex + 1, queryEnd), params);
  }

  if (hashIndex >= 0) {
    collectParams(url.slice(hashIndex + 1), params);
  }

  return params;
}

export async function completeAuthSessionFromUrl(url: string) {
  const params = getAuthParamsFromUrl(url);
  const errorMessage = params.error_description ?? params.error_code ?? params.error;
  const isPasswordRecovery =
    params.type === 'recovery' ||
    url.includes('reset-password') ||
    url.includes('reset_password');

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  if (params.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw error;
    if (data.session?.access_token) {
      await saveToken(data.session.access_token);
    }
    return { completed: Boolean(data.session), isPasswordRecovery };
  }

  if (params.access_token && params.refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) throw error;
    if (data.session?.access_token) {
      await saveToken(data.session.access_token);
    }
    return { completed: Boolean(data.session), isPasswordRecovery };
  }

  return { completed: false, isPasswordRecovery };
}
