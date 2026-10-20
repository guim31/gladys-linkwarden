// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// The port Linkwarden listens on out of the box (its Docker image exposes 3000).
export const DEFAULT_PORT = 3000;

export const REFRESH_MINUTES = ['5', '15', '30', '60'];

export const DEFAULT_CONFIG = {
  url: '',
  access_token: '',
  refresh_minutes: '30',
  language: 'fr',
};

/**
 * Turn what the user typed into the base URL of Linkwarden, without `/api/v1`:
 * - `192.0.2.10` or `linkwarden.local` (no scheme, no port): port 3000;
 * - `192.0.2.10:3100`: that port;
 * - `https://example.org/linkwarden/`: exactly that address (reverse proxy).
 * A pasted `/api/v1` suffix is dropped. Returns null when it is not usable.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (text === '') {
    return null;
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  let url;
  try {
    url = new URL(hasScheme ? text : `http://${text}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.hostname === '') {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) {
    // Credentials in the URL would end up in logs and error messages.
    return null;
  }
  if (!hasScheme && url.port === '') {
    url.port = String(DEFAULT_PORT);
  }
  const path = url.pathname
    .replace(/\/+$/, '')
    .replace(/\/api(\/v1)?$/i, '')
    .replace(/\/+$/, '');
  return `${url.protocol}//${url.host}${path}`;
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const typed = text(source.url);
  const url = normalizeUrl(typed);
  const refresh = String(source.refresh_minutes ?? '');
  return {
    url,
    urlInvalid: typed !== '' && url === null,
    // A token pasted with its scheme ("Bearer eyJ...") works as well.
    token: text(source.access_token).replace(/^bearer\s+/i, ''),
    refreshMinutes: Number(
      REFRESH_MINUTES.includes(refresh) ? refresh : DEFAULT_CONFIG.refresh_minutes,
    ),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
