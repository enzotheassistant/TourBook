export const CLIENT_ACCESS_TOKEN_COOKIE_NAME = 'tourbook_client_access_token';
export const CLIENT_REFRESH_TOKEN_COOKIE_NAME = 'tourbook_client_refresh_token';
export const CLIENT_ACCESS_TOKEN_STORAGE_KEY = 'tourbook.auth.accessToken';
export const CLIENT_REFRESH_TOKEN_STORAGE_KEY = 'tourbook.auth.refreshToken';
const CLIENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

type ClientSessionInput = {
  accessToken: string;
  refreshToken: string;
};

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function writeCookie(name: string, value: string) {
  if (!isBrowser()) return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${CLIENT_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

function clearCookie(name: string) {
  if (!isBrowser()) return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
}

export function setClientSession(session: ClientSessionInput) {
  if (!isBrowser()) return;
  window.localStorage.setItem(CLIENT_ACCESS_TOKEN_STORAGE_KEY, session.accessToken);
  window.localStorage.setItem(CLIENT_REFRESH_TOKEN_STORAGE_KEY, session.refreshToken);
  writeCookie(CLIENT_ACCESS_TOKEN_COOKIE_NAME, session.accessToken);
  writeCookie(CLIENT_REFRESH_TOKEN_COOKIE_NAME, session.refreshToken);
}

export function clearClientSession() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(CLIENT_ACCESS_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(CLIENT_REFRESH_TOKEN_STORAGE_KEY);
  clearCookie(CLIENT_ACCESS_TOKEN_COOKIE_NAME);
  clearCookie(CLIENT_REFRESH_TOKEN_COOKIE_NAME);
}

export function getClientAccessToken() {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(CLIENT_ACCESS_TOKEN_STORAGE_KEY);
}

export function getClientAuthHeaders(initHeaders?: HeadersInit) {
  const headers = new Headers(initHeaders ?? undefined);
  const accessToken = getClientAccessToken();
  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return headers;
}
