// -----------------------------------------------------------------------------
// The REST API of Linkwarden (`<base>/api/v1/...`), the few calls the
// integration needs, authenticated by an access token (`Authorization: Bearer`).
//
// Facts checked on a real server, Linkwarden 2.16.3
// (ghcr.io/linkwarden/linkwarden), see test/fixtures/linkwarden/:
// - answers are JSON: `{ response }` for most routes, `{ data, success,
//   message }` for `/search`; errors carry their reason in `response`
//   ("You must be logged in.", "Error: Invalid URL [url]", "Collection is not
//   accessible.", "Link already exists" in 409 when the user forbids
//   duplicates); an unknown route is an HTML 404 page;
// - `GET /search` without a query is the list of links, newest first (sorted
//   by id, which only grows), 50 per page, `cursor` being the last id seen;
//   `GET /links` does the same but is deprecated (DISABLE_DEPRECATED_ROUTES);
// - `GET /collections` carries `_count.links` per collection (links directly
//   in it, not in its sub-collections);
// - `POST /links` with `collection: { name }` CREATES a missing collection:
//   the integration always resolves the name itself and sends an id.
// -----------------------------------------------------------------------------

export const DEFAULT_TIMEOUT = 15_000;

export class LinkwardenError extends Error {
  /**
   * @param {'unreachable' | 'unauthorized' | 'not_found' | 'timeout' | 'http' | 'invalid' | 'rejected' | 'duplicate'} kind
   * @param {string} message never carries a credential
   * @param {number} [status]
   */
  constructor(kind, message, status) {
    super(message);
    this.name = 'LinkwardenError';
    this.kind = kind;
    this.status = status;
  }
}

export class LinkwardenClient {
  /**
   * @param {object} options
   * @param {string} options.url normalized base URL (see normalizeUrl)
   * @param {string} options.token
   * @param {typeof fetch} [options.fetch]
   * @param {number} [options.timeout]
   */
  constructor({ url, token, fetch: fetchImpl, timeout }) {
    this.url = url;
    this.token = token;
    this.fetch = fetchImpl ?? globalThis.fetch;
    this.timeout = timeout ?? DEFAULT_TIMEOUT;
  }

  get apiUrl() {
    return `${this.url}/api/v1`;
  }

  async #send(method, path, body) {
    const headers = { Accept: 'application/json', Authorization: `Bearer ${this.token}` };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    let response;
    let raw;
    try {
      response = await this.fetch(`${this.apiUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeout),
        redirect: 'follow',
      });
      raw = await response.text();
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new LinkwardenError('timeout', `No answer from Linkwarden within ${this.timeout} ms`);
      }
      const cause = err?.cause?.code ?? err?.cause?.message ?? err?.message ?? 'error';
      throw new LinkwardenError('unreachable', `Linkwarden unreachable (${cause})`);
    }
    if (!response.ok) {
      throw LinkwardenClient.#fail(path, response.status, raw);
    }
    try {
      return JSON.parse(raw);
    } catch {
      // A proxy login page answering 200 in HTML, for instance.
      throw new LinkwardenError('invalid', `${path}: the answer is not JSON (is this Linkwarden?)`);
    }
  }

  static #fail(path, status, raw) {
    let detail = raw.trim() || `HTTP ${status}`;
    try {
      const data = JSON.parse(raw);
      if (typeof data?.response === 'string') {
        detail = data.response;
      } else if (typeof data?.message === 'string') {
        detail = data.message;
      }
    } catch {
      // not JSON
    }
    if (/^\s*</.test(detail)) {
      detail = `HTTP ${status}`;
    }
    const kind =
      status === 401 || status === 403
        ? 'unauthorized'
        : status === 404
          ? 'not_found'
          : status === 409
            ? 'duplicate'
            : status === 400
              ? 'rejected'
              : 'http';
    return new LinkwardenError(
      kind,
      `${path.split('?')[0]}: ${detail
        .replace(/^Error:\s*/, '')
        .replace(/\s+/g, ' ')
        .slice(0, 120)}`,
      status,
    );
  }

  /** `{ id, uuid, name, username, ... }`: the owner of the token. */
  async me() {
    const data = await this.#send('GET', '/users/me');
    const user = data?.response;
    if (!user || !Number.isInteger(user.id)) {
      throw new LinkwardenError('invalid', 'This address does not answer like Linkwarden');
    }
    return user;
  }

  /** Every collection the user owns or is a member of, with `_count.links`. */
  async collections() {
    const data = await this.#send('GET', '/collections');
    if (!Array.isArray(data?.response)) {
      throw new LinkwardenError('invalid', 'Linkwarden did not answer its collections');
    }
    return data.response;
  }

  /**
   * One page of links, the newest first (50 by default on the server).
   * @param {{ collectionId?: number, cursor?: number }} [query]
   * @returns {Promise<{ links: object[], nextCursor: number | null }>}
   */
  async links({ collectionId, cursor } = {}) {
    const params = new URLSearchParams({ sort: '0' });
    if (collectionId !== undefined) {
      params.set('collectionId', String(collectionId));
    }
    if (cursor !== undefined && cursor !== null) {
      params.set('cursor', String(cursor));
    }
    const data = await this.#send('GET', `/search?${params}`);
    if (!Array.isArray(data?.data?.links)) {
      throw new LinkwardenError('invalid', 'Linkwarden did not answer its links');
    }
    const next = data.data.nextCursor;
    return { links: data.data.links, nextCursor: Number.isInteger(next) ? next : null };
  }

  /**
   * The newest links, page after page, until `stop(page)` says enough or
   * `maxPages` pages were read.
   * @param {(links: object[]) => boolean} stop
   */
  async recentLinks(stop, maxPages = 10) {
    const found = [];
    let cursor = null;
    for (let page = 0; page < maxPages; page += 1) {
      const result = await this.links({ cursor });
      found.push(...result.links);
      cursor = result.nextCursor;
      if (cursor === null || stop(result.links)) {
        break;
      }
    }
    return found;
  }

  /**
   * Save a link.
   * @param {{ url: string, name?: string, collectionId?: number, tags?: string[] }} link
   */
  async createLink({ url, name, collectionId, tags = [] }) {
    const body = { url };
    if (name) {
      body.name = name;
    }
    if (collectionId !== undefined) {
      body.collection = { id: collectionId };
    }
    if (tags.length > 0) {
      body.tags = tags.map((tag) => ({ name: tag }));
    }
    const data = await this.#send('POST', '/links', body);
    if (!data?.response || !Number.isInteger(data.response.id)) {
      throw new LinkwardenError('invalid', 'Linkwarden did not answer the saved link');
    }
    return data.response;
  }
}
