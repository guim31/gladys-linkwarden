// -----------------------------------------------------------------------------
// A fake Linkwarden behind a `fetch` function: it starts from the bodies
// recorded on a real Linkwarden 2.16.3 (test/fixtures/linkwarden/2.16.3/),
// keeps its collections and links in memory, and answers the errors the real
// server answers (JSON 401, 400 and 409, an HTML 404 for an unknown route).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const HOST = 'http://192.0.2.40:3000';
export const TOKEN = 'eyJ.test.token';
// 13:00 UTC on the day the fixtures were recorded (12:49 UTC): their three
// links count as added today in any time zone from UTC-12 to UTC+11.
export const NOW = Date.parse('2026-10-20T13:00:00.000Z');

export const fixture = (name) =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/linkwarden/2.16.3/${name}.json`, import.meta.url), 'utf8'),
  );

export const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

export function createLinkwarden({ pageSize = 50 } = {}) {
  const state = {
    user: fixture('me').body.response,
    collections: structuredClone(fixture('collections').body.response).map((c) => {
      delete c._count;
      return c;
    }),
    links: structuredClone(fixture('search').body.data.links),
    tags: [],
    preventDuplicates: false,
    down: false,
    html: false,
    requests: [],
    clock: Date.parse('2026-10-20T12:50:00.000Z'),
    pageSize,
  };
  const answer = (status, body, type = 'application/json') =>
    new Response(
      typeof body === 'string' && type !== 'application/json' ? body : JSON.stringify(body),
      {
        status,
        headers: { 'content-type': type },
      },
    );
  const nextId = () => Math.max(0, ...state.links.map((l) => l.id)) + 1;
  const collectionById = (id) => state.collections.find((c) => c.id === id);

  /** Add a link as a user would (web app, browser extension, import...). */
  function addLink({
    url = 'https://example.org/article',
    name,
    collectionId = 3,
    tags = [],
    created,
    importDate = null,
    description = '',
  } = {}) {
    state.clock += 60_000;
    const at = created ?? new Date(state.clock).toISOString();
    const collection = structuredClone(collectionById(collectionId));
    delete collection.parent;
    delete collection.members;
    const link = {
      id: nextId(),
      name: name ?? url,
      type: 'url',
      description,
      createdById: state.user.id,
      collectionId,
      url,
      importDate,
      createdAt: at,
      updatedAt: at,
      tags: tags.map((tagName, i) => ({ id: 100 + i, name: tagName, ownerId: state.user.id })),
      collection,
      pinnedBy: [],
    };
    state.links.push(link);
    return link;
  }

  async function fetch(url, init = {}) {
    const { pathname, searchParams } = new URL(url);
    const path = pathname.replace(/^\/api\/v1/, '');
    const method = init.method ?? 'GET';
    state.requests.push(`${method} ${path}${searchParams.size ? `?${searchParams}` : ''}`);
    if (state.down) {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }
    if (state.html) {
      return answer(200, '<html>Login</html>', 'text/html');
    }
    if (init.headers?.Authorization !== `Bearer ${TOKEN}`) {
      return answer(401, fixture('unauthorized').body);
    }
    const body = init.body ? JSON.parse(init.body) : undefined;

    if (method === 'GET' && path === '/users/me') {
      return answer(200, { response: state.user });
    }
    if (method === 'GET' && path === '/collections') {
      return answer(200, {
        response: state.collections.map((c) => ({
          ...c,
          _count: { links: state.links.filter((l) => l.collectionId === c.id).length },
        })),
      });
    }
    if (method === 'GET' && path === '/search') {
      let list = [...state.links].sort((a, b) => b.id - a.id);
      if (searchParams.has('collectionId')) {
        const id = Number(searchParams.get('collectionId'));
        list = list.filter((l) => l.collectionId === id);
      }
      if (searchParams.has('cursor')) {
        const cursor = Number(searchParams.get('cursor'));
        list = list.filter((l) => l.id < cursor);
      }
      const page = list.slice(0, state.pageSize);
      return answer(200, {
        data: {
          links: page,
          nextCursor: page.length === state.pageSize ? page.at(-1).id : null,
        },
        success: true,
        message: 'Success',
      });
    }
    if (method === 'POST' && path === '/links') {
      if (!/^https?:\/\/\S+$/.test(body.url ?? '')) {
        return answer(400, fixture('link-create-bad').body);
      }
      const collectionId = body.collection?.id ?? 3;
      if (!collectionById(collectionId)) {
        return answer(400, fixture('link-create-badcol').body);
      }
      if (state.preventDuplicates && state.links.some((l) => l.url === body.url)) {
        return answer(409, { response: 'Link already exists' });
      }
      const link = addLink({
        url: body.url,
        name: body.name || body.url,
        collectionId,
        tags: (body.tags ?? []).map((t) => t.name),
      });
      return answer(200, { response: link });
    }
    return answer(404, fixture('not-found').body, 'text/html; charset=utf-8');
  }

  return {
    state,
    fetch,
    addLink,
    remove(id) {
      state.links = state.links.filter((l) => l.id !== id);
    },
    goDown() {
      state.down = true;
    },
    goUp() {
      state.down = false;
    },
  };
}
