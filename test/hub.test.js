// -----------------------------------------------------------------------------
// The hub end to end, against the SDK's fake Gladys and a fake Linkwarden
// answering the bodies of a real Linkwarden 2.16.3: devices and states, the
// scene trigger, scene actions, widget, connection status, persistence.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { startOfDay } from '../src/hub.js';
import { MemoryStore } from '../src/store.js';
import { HOST, TOKEN, createLinkwarden, settle } from './helpers/fakeLinkwarden.js';
import {
  USER,
  collectionDevice,
  createAll,
  createWorld,
  mainDevice,
  mainFeature,
} from './helpers/world.js';

const events = (fake) => fake.sceneEvents.filter((event) => event.key === 'link_added');
const RECIPES = 1;
const READING = 2;
const UNORGANIZED = 3;

test('a Linkwarden device and one device per collection, states once added', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => [d.external_id, d.name]),
    [
      [mainDevice, 'Linkwarden'],
      [collectionDevice(RECIPES), 'Recipes'],
      [collectionDevice(READING), 'Reading'],
      [collectionDevice(UNORGANIZED), 'Unorganized'],
    ],
  );
  assert.ok(devices.every((d) => d.should_poll === false));
  assert.deepEqual(
    devices[0].features.map((f) => f.name),
    ['Liens', "Liens ajoutés aujourd'hui", 'Collections', 'Dernier lien'],
  );
  // Not added yet: nothing published.
  assert.equal(world.fake.states.length, 0);
  await createAll(world.fake);
  assert.equal(world.fake.lastState(mainFeature('links')), 3);
  assert.equal(world.fake.lastState(mainFeature('today')), 3);
  assert.equal(world.fake.lastState(mainFeature('collections')), 3);
  // Linkwarden named the link after its URL: the domain is shown instead.
  assert.equal(world.fake.lastState(mainFeature('latest')), '192.0.2.10');
  assert.equal(world.fake.lastState(`${collectionDevice(RECIPES)}:links`), 2);
  assert.equal(world.fake.lastState(`${collectionDevice(READING)}:links`), 0);
  assert.equal(world.fake.lastState(`${collectionDevice(UNORGANIZED)}:links`), 1);
  assert.ok(world.fake.widgetRefreshes.length > 0);
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('a device added later gets its states at once', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const recipes = world.fake.discoveredDevices[1];
  await world.fake.deviceCreated(recipes);
  await settle();
  assert.equal(world.fake.lastState(`${collectionDevice(RECIPES)}:links`), 2);
  assert.equal(world.fake.lastState(mainFeature('links')), undefined);
  // onPoll (a Gladys that would poll anyway) republishes too.
  assert.equal((await world.fake.poll(recipes)).success, true);
});

test('the container reads Linkwarden on its own timer, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const world = await createWorld({
    config: { url: HOST, access_token: TOKEN, refresh_minutes: '5' },
  });
  t.after(() => world.app.stop());
  await createAll(world.fake);
  world.server.addLink({ url: 'https://example.org/read-me', name: 'Read me' });
  t.mock.timers.tick(5 * 60_000);
  await settle(20);
  assert.equal(world.fake.lastState(mainFeature('links')), 4);
  assert.equal(world.fake.lastState(mainFeature('today')), 4);
  assert.equal(world.fake.lastState(mainFeature('latest')), 'Read me');
  assert.ok(!world.fake.requests.some((r) => r.path?.includes('poll')));
});

test('links added today fall back to 0 after midnight', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world.fake);
  assert.equal(world.fake.lastState(mainFeature('today')), 3);
  world.clock.now = startOfDay(world.clock.now) + 24 * 3_600_000 + 60_000;
  await world.hub.refresh();
  assert.equal(world.fake.lastState(mainFeature('today')), 0);
  world.server.addLink({ created: new Date(world.clock.now).toISOString() });
  await world.hub.refresh();
  assert.equal(world.fake.lastState(mainFeature('today')), 1);
  assert.equal(world.fake.lastState(mainFeature('links')), 4);
});

test('new link: silent baseline, one event per link, oldest first, never twice', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(world.fake.sceneEvents.length, 0, 'the first read announces nothing');
  const a = world.server.addLink({
    url: 'https://example.org/a',
    name: 'Article A',
    collectionId: READING,
    tags: ['news', 'tech'],
    description: 'About A',
  });
  world.server.addLink({ url: 'https://example.org/b', name: 'Article B' });
  world.server.addLink({ url: 'https://example.org/old', importDate: '2020-01-01T00:00:00.000Z' });
  await world.hub.refresh();
  await world.hub.refresh();
  const added = events(world.fake);
  assert.equal(added.length, 2, 'imports are not announced');
  assert.deepEqual(added[0].data, {
    collection: collectionDevice(READING),
    name: 'Article A',
    url: 'https://example.org/a',
    description: 'About A',
    collection_name: 'Reading',
    tags: 'news, tech',
    link_id: a.id,
  });
  assert.equal(added[1].data.name, 'Article B');
  assert.equal(added[1].data.collection, collectionDevice(UNORGANIZED));
});

test('more than one page of new links: all read, ten announced', async (t) => {
  const world = await createWorld({ server: createLinkwarden({ pageSize: 4 }) });
  t.after(() => world.app.stop());
  for (let i = 0; i < 12; i += 1) {
    world.server.addLink({ url: `https://example.org/${i}`, name: `Link ${i}` });
  }
  await createAll(world.fake);
  await world.hub.refresh();
  const added = events(world.fake);
  assert.equal(added.length, 10);
  assert.equal(added[0].data.name, 'Link 0');
  assert.equal(world.fake.lastState(mainFeature('today')), 15);
  await world.hub.refresh();
  assert.equal(events(world.fake).length, 10, 'the rest is recorded as seen');
});

test('an event Gladys did not take is fired again at the next read', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const publish = world.gladys.publishSceneEvent.bind(world.gladys);
  let down = true;
  world.gladys.publishSceneEvent = async (...args) => {
    if (down) {
      throw Object.assign(new Error('Gladys restarting'), { status: 503 });
    }
    return publish(...args);
  };
  world.server.addLink({ name: 'First' });
  world.server.addLink({ name: 'Second' });
  await world.hub.refresh();
  assert.equal(events(world.fake).length, 0);
  down = false;
  await world.hub.refresh();
  assert.deepEqual(
    events(world.fake).map((e) => e.data.name),
    ['First', 'Second'],
  );
});

test('the last link seen survives a restart', async (t) => {
  const store = new MemoryStore();
  const server = createLinkwarden();
  const first = await createWorld({ server, store });
  await first.app.stop();
  assert.equal(store.data.user, USER);
  assert.equal(store.data.lastId, 3);
  server.addLink({ name: 'While stopped' });
  const second = await createWorld({ server, store });
  t.after(() => second.app.stop());
  assert.deepEqual(
    events(second.fake).map((e) => e.data.name),
    ['While stopped'],
  );
});

test('add_link: saves in a collection with tags, never announced', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world.fake);
  const ack = await world.fake.sceneAction('add_link', {
    url: 'www.example.org/soup',
    name: 'Soup',
    collection: 'recipes',
    tags: 'dinner, #Soup; dinner',
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    link_id: 4,
    name: 'Soup',
    collection: 'Recipes',
    already_saved: false,
  });
  const saved = world.server.state.links.at(-1);
  assert.equal(saved.url, 'https://www.example.org/soup');
  assert.equal(saved.collectionId, RECIPES);
  assert.deepEqual(
    saved.tags.map((tag) => tag.name),
    ['dinner', 'Soup'],
  );
  await settle(20);
  await world.hub.refresh();
  assert.equal(world.fake.sceneEvents.length, 0, 'no loop through the trigger');
  assert.equal(world.fake.lastState(`${collectionDevice(RECIPES)}:links`), 3);
  // A link saved by hand afterwards is announced.
  world.server.addLink({ name: 'By hand' });
  await world.hub.refresh();
  assert.deepEqual(
    events(world.fake).map((e) => e.data.name),
    ['By hand'],
  );
});

test('add_link: errors in clear words, an unknown collection is never created', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.fake.configUpdated({ url: HOST, access_token: TOKEN, language: 'en' });
  const fail = async (fields) => (await world.fake.sceneAction('add_link', fields)).error;
  assert.match(await fail({ url: 'not a link' }), /http:\/\/ or https:\/\//);
  assert.match(await fail({ url: 'ftp://example.org' }), /http:\/\/ or https:\/\//);
  assert.match(
    await fail({ url: 'https://example.org', collection: 'Nope' }),
    /No collection "Nope"/,
  );
  assert.equal(world.server.state.collections.length, 3);
  world.server.state.preventDuplicates = true;
  const again = await world.fake.sceneAction('add_link', { url: 'http://192.0.2.10/pasta' });
  assert.deepEqual(again.data.outputs, { name: '', collection: '', already_saved: true });
  world.server.goDown();
  assert.match(await fail({ url: 'https://example.org/x' }), /does not answer/);
});

test('add_link: a sub-collection by Parent/Child', async (t) => {
  const server = createLinkwarden();
  server.state.collections.push({
    ...server.state.collections[0],
    id: 4,
    name: 'Desserts',
    parentId: RECIPES,
    parent: { id: RECIPES, name: 'Recipes' },
  });
  const world = await createWorld({ server });
  t.after(() => world.app.stop());
  assert.equal(world.fake.discoveredDevices.at(-1).name, 'Recipes / Desserts');
  const ack = await world.fake.sceneAction('add_link', {
    url: 'https://example.org/cake',
    collection: 'Recipes / Desserts',
  });
  assert.equal(ack.data.outputs.collection, 'Desserts');
  assert.equal(server.state.links.at(-1).collectionId, 4);
});

test('read_latest: the newest links, of all or of one collection', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.server.addLink({ url: 'https://example.org/a', name: 'Article A', collectionId: READING });
  let ack = await world.fake.sceneAction('read_latest', { count: '3' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    count: 3,
    links:
      'Article A — https://example.org/a\n192.0.2.10 — http://192.0.2.10/pasta\n192.0.2.10 — http://192.0.2.10/article',
    latest_name: 'Article A',
    latest_url: 'https://example.org/a',
  });
  ack = await world.fake.sceneAction('read_latest', { collection: 'Recipes' });
  assert.equal(ack.data.outputs.count, 2);
  ack = await world.fake.sceneAction('read_latest', { collection: 'Unorganized', count: '1' });
  assert.equal(ack.data.outputs.latest_url, 'http://192.0.2.10/article');
});

test('widget: counters, newest links, a collection, and the save form', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.server.addLink({ url: 'https://example.org/a', name: 'Article A', collectionId: READING });
  await world.hub.refresh();
  let ack = await world.fake.widgetGet('links', { language: 'fr', settings: {} });
  let content = ack.data.content;
  validateWidgetContent(content);
  assert.deepEqual(
    content.components.slice(0, 3).map((c) => [c.label, c.value]),
    [
      ['Liens', 4],
      ["Aujourd'hui", 4],
      ['Collections', 3],
    ],
  );
  const list = content.components[3];
  assert.equal(list.items[0].title, 'Article A');
  assert.match(list.items[0].subtitle, /^example\.org · Reading · /);
  assert.deepEqual(
    list.items[0].links.map((l) => l.url),
    ['https://example.org/a'],
    'no Linkwarden link over plain http',
  );

  ack = await world.fake.widgetGet('links', {
    language: 'en',
    settings: { collection: collectionDevice(RECIPES) },
  });
  content = ack.data.content;
  validateWidgetContent(content);
  assert.deepEqual([content.components[0].label, content.components[0].value], ['Recipes', 2]);
  assert.equal(content.components[1].items.length, 2);

  const saved = await world.fake.widgetAction(
    'links',
    'save',
    {},
    {
      settings: { collection: collectionDevice(RECIPES) },
      values: { url: 'https://example.org/stew' },
    },
  );
  assert.equal(saved.success, true, saved.error);
  assert.equal(saved.data.message.en, 'Link saved in Linkwarden.');
  assert.equal(world.server.state.links.at(-1).collectionId, RECIPES);
  const old = await world.fake.widgetAction('links', 'save', {}, { settings: {} });
  assert.match(old.error, /5\.2/);
});

test('widget links to Linkwarden over https', async (t) => {
  const world = await createWorld({
    config: { url: 'https://links.example.org', access_token: TOKEN },
  });
  t.after(() => world.app.stop());
  const content = (await world.fake.widgetGet('links', { settings: {} })).data.content;
  assert.equal(
    content.components[3].items[0].links.at(-1).url,
    'https://links.example.org/links/3',
  );
});

test('connection status: missing settings, refused token, down and back, not Linkwarden', async (t) => {
  const world = await createWorld({ config: { url: '' } });
  t.after(() => world.app.stop());
  assert.match(world.fake.connectionStatus.message.en, /Enter the address/);
  await world.fake.configUpdated({ url: 'ftp://x', access_token: TOKEN });
  assert.match(world.fake.connectionStatus.message.en, /not valid/);
  await world.fake.configUpdated({ url: HOST });
  assert.match(world.fake.connectionStatus.message.en, /access token/);
  await world.fake.configUpdated({ url: HOST, access_token: 'wrong' });
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.en, /refused the access token/);
  await world.fake.configUpdated({ url: HOST, access_token: `Bearer ${TOKEN}` });
  assert.equal(world.fake.connectionStatus.connected, true);
  world.server.goDown();
  await world.hub.refresh();
  assert.match(world.fake.connectionStatus.message.en, /does not answer/);
  const widget = (await world.fake.widgetGet('links', { settings: {} })).data.content;
  assert.ok(widget.components.some((c) => /does not answer/.test(c.text ?? '')));
  world.server.goUp();
  await world.hub.refresh();
  assert.equal(world.fake.connectionStatus.connected, true);
  world.server.state.html = true;
  await world.hub.refresh();
  assert.match(world.fake.connectionStatus.message.en, /does not answer like Linkwarden/);
});

test('test_connection: who and how many', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.action('test_connection');
  assert.equal(
    ack.data.message.fr,
    'Connecté à Linkwarden en tant que Alice Test : 3 lien(s), 3 collection(s).',
  );
});

test('the language changes the names, not the devices', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.fake.configUpdated({ url: HOST, access_token: TOKEN, language: 'de' });
  const [main] = world.fake.discoveredDevices;
  assert.equal(main.external_id, mainDevice);
  assert.deepEqual(
    main.features.map((f) => f.name),
    ['Links', 'Heute hinzugefügte Links', 'Sammlungen', 'Neuester Link'],
  );
});
