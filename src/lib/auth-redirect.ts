const APP_ORIGIN = 'https://bigb.invalid';

export function getSafeReturnPath(value: string | null | undefined, fallback = '/account'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')
    || [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    return fallback;
  }

  try {
    const url = new URL(value, APP_ORIGIN);
    if (url.origin !== APP_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function createAuthCallbackUrl(origin: string, returnPath: string): string {
  const callback = new URL('/auth', origin);
  callback.searchParams.set('next', getSafeReturnPath(returnPath));
  return callback.toString();
}
