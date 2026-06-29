import * as Linking from 'expo-linking';

const DEFAULT_AUTH_REDIRECT_PATH = 'login';

export function getAuthRedirectUrl(path = DEFAULT_AUTH_REDIRECT_PATH) {
  return Linking.createURL(path);
}
