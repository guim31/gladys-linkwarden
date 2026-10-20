// -----------------------------------------------------------------------------
// The Linkwarden client and the model, on the bodies recorded on a real
// Linkwarden 2.16.3: parsing, errors by kind, no credential in messages.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, normalizeUrl } from '../src/config.js';
import { LinkwardenClient } from '../src/linkwarden/client.js';
import {
  asLink,
  findCollection,
  parseTags,
  summarizeCollections,
  summarizeLink,
} from '../src/linkwarden/model.js';
import { fixture } from './helpers/fakeLinkwarden.js';

const TOKEN = 'eyJ.secret';

/** A client whose fetch answers one recorded body. */
function clientAnswering(name, { type = 'application/json' } = {}) {
  const recorded = fixture(name);
  const calls = [];
  const client = new LinkwardenClient({
    url: 'http://192.0.2.40:3000',
    token: TOKEN,
    fetch: async (url, init) => {
      calls.push({ url, init });
      const body =
        typeof recorded.body === 'string' ? recorded.body : JSON.stringify(recorded.body);
      return new Response(body, { status: recorded.status, headers: { 'content-type': type } });
    },
  });
  return { client, calls };
}

const rejects = async (promise, kind, pattern) => {
  const err = await promise.then(
    () => assert.fail('should have failed'),
    (e) => e,
  );
  assert.equal(err.kind, kind);
  if (pattern) {
    assert.match(err.message, pattern);
  }
  assert.ok(!err.message.includes(TOKEN));
};

test('reads the user, the collections and a page of links', async () => {
  const me = clientAnswering('me');
  assert.equal((await me.client.me()).username, 'alice');
  assert.equal(me.calls[0].url, 'http://192.0.2.40:3000/api/v1/users/me');
  assert.equal(me.calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);

  const collections = summarizeCollections(
    await clientAnswering('collections').client.collections(),
  );
  assert.deepEqual(collections, [
    { id: 1, name: 'Recipes', parent: '', links: 2 },
    { id: 2, name: 'Reading', parent: '', links: 0 },
    { id: 3, name: 'Unorganized', parent: '', links: 1 },
  ]);

  const search = clientAnswering('search-collection');
  const page = await search.client.links({ collectionId: 1, cursor: 9 });
  assert.equal(
    search.calls[0].url,
    'http://192.0.2.40:3000/api/v1/search?sort=0&collectionId=1&cursor=9',
  );
  assert.equal(page.nextCursor, null);
  assert.deepEqual(summarizeLink(page.links.at(-1)), {
    id: 1,
    name: 'Pasta carbonara',
    url: 'http://192.0.2.10/pasta',
    description: '',
    collectionId: 1,
    collection: 'Recipes',
    tags: ['dinner', 'italian'],
    pinned: false,
    imported: false,
    created: page.links.at(-1).createdAt,
  });
  assert.deepEqual((await clientAnswering('search-badcol').client.links()).links, []);
});

test('saves a link, by collection id, with tags', async () => {
  const { client, calls } = clientAnswering('link-create');
  const link = await client.createLink({
    url: 'http://192.0.2.10/pasta',
    name: 'Pasta carbonara',
    collectionId: 1,
    tags: ['dinner', 'italian'],
  });
  assert.equal(link.id, 1);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    url: 'http://192.0.2.10/pasta',
    name: 'Pasta carbonara',
    collection: { id: 1 },
    tags: [{ name: 'dinner' }, { name: 'italian' }],
  });
});

test('errors by kind, with the reason Linkwarden gave', async () => {
  await rejects(clientAnswering('unauthorized').client.me(), 'unauthorized', /logged in/);
  await rejects(
    clientAnswering('link-create-bad').client.createLink({ url: 'x' }),
    'rejected',
    /\/links: Invalid URL \[url\]/,
  );
  await rejects(
    clientAnswering('link-create-badcol').client.createLink({ url: 'x' }),
    'rejected',
    /Collection is not accessible/,
  );
  await rejects(
    clientAnswering('not-found', { type: 'text/html' }).client.me(),
    'not_found',
    /HTTP 404/,
  );
  const down = new LinkwardenClient({
    url: 'http://192.0.2.40:3000',
    token: TOKEN,
    fetch: async () => {
      throw new TypeError('fetch failed', { cause: { code: 'EHOSTUNREACH' } });
    },
  });
  await rejects(down.collections(), 'unreachable', /EHOSTUNREACH/);
  const slow = new LinkwardenClient({
    url: 'http://192.0.2.40:3000',
    token: TOKEN,
    timeout: 20,
    fetch: (url, init) =>
      new Promise((resolve, reject) => {
        // The timer of AbortSignal.timeout does not hold the event loop.
        const hold = setTimeout(() => {}, 5_000);
        init.signal.addEventListener('abort', () => {
          clearTimeout(hold);
          reject(init.signal.reason);
        });
      }),
  });
  await rejects(slow.me(), 'timeout');
  const html = new LinkwardenClient({
    url: 'http://192.0.2.40:3000',
    token: TOKEN,
    fetch: async () => new Response('<html>login</html>', { status: 200 }),
  });
  await rejects(html.me(), 'invalid', /not JSON/);
});

test('reads further pages until told to stop', async () => {
  const pages = {
    '': { links: [{ id: 9 }, { id: 8 }], nextCursor: 8 },
    8: { links: [{ id: 7 }, { id: 6 }], nextCursor: 6 },
    6: { links: [{ id: 5 }], nextCursor: null },
  };
  const client = new LinkwardenClient({
    url: 'http://192.0.2.40:3000',
    token: TOKEN,
    fetch: async (url) => {
      const cursor = new URL(url).searchParams.get('cursor') ?? '';
      return Response.json({ data: pages[cursor], success: true });
    },
  });
  assert.equal((await client.recentLinks(() => false)).length, 5);
  assert.equal((await client.recentLinks((page) => page.at(-1).id <= 8)).length, 2);
  assert.equal((await client.recentLinks(() => false, 2)).length, 4);
});

test('addresses, tokens, links, tags and collections typed by the user', () => {
  assert.equal(normalizeUrl('192.0.2.40'), 'http://192.0.2.40:3000');
  assert.equal(normalizeUrl('https://links.example.org/api/v1/'), 'https://links.example.org');
  assert.equal(normalizeUrl('http://user:pw@192.0.2.40'), null);
  const config = normalizeConfig({ url: '192.0.2.40:3100', access_token: ' Bearer eyJ.x ' });
  assert.deepEqual(config, {
    url: 'http://192.0.2.40:3100',
    urlInvalid: false,
    token: 'eyJ.x',
    refreshMinutes: 30,
    language: 'fr',
  });
  assert.equal(normalizeConfig({ refresh_minutes: '1' }).refreshMinutes, 30);
  assert.equal(asLink('www.example.org/a'), 'https://www.example.org/a');
  assert.equal(asLink('example.org'), null);
  assert.equal(asLink('javascript:alert(1)'), null);
  assert.deepEqual(parseTags('Dinner, #italian;dinner,,  '), ['Dinner', 'italian']);
  assert.equal(parseTags('x'.repeat(80))[0].length, 50);
  const collections = [
    { id: 1, name: 'Recipes', parent: '' },
    { id: 4, name: 'Desserts', parent: 'Recipes' },
    { id: 5, name: 'Desserts', parent: '' },
  ];
  assert.equal(findCollection(collections, ' recipes ').id, 1);
  assert.equal(findCollection(collections, 'Desserts').id, 5);
  assert.equal(findCollection(collections, 'Recipes/Desserts').id, 4);
  assert.equal(findCollection(collections, 'Nope'), undefined);
});
