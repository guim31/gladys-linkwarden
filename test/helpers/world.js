// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys (a real GladysIntegration on an
// in-memory transport), the integration wired on it by registerHandlers, and
// a fake Linkwarden.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { MemoryStore } from '../../src/store.js';
import { HOST, NOW, TOKEN, createLinkwarden, settle } from './fakeLinkwarden.js';

export const FAST_TIMINGS = { widgetGap: 0, requestTimeout: 200 };

export async function createWorld({
  server = createLinkwarden(),
  config = { url: HOST, access_token: TOKEN },
  devices = [],
  connect = true,
  store = new MemoryStore(),
  clock = { now: NOW },
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    fetch: server.fetch,
    timings: FAST_TIMINGS,
    now: () => clock.now,
    store,
  });
  if (connect) {
    await gladys.connect();
    await settle(20);
  }
  return { gladys, app, hub: app.hub, server, store, clock, fake: gladys.fake };
}

// The Linkwarden user of the fixtures (anonymized uuid).
export const USER = '00000000-1111-4222-8333-444444444444';
export const mainDevice = `ext:test-integration:linkwarden:${USER}`;
export const mainFeature = (key) => `${mainDevice}:${key}`;
export const collectionDevice = (id) => `ext:test-integration:collection:${USER}_${id}`;

/** Add every discovered device to Gladys, as the user would. */
export async function createAll(fake) {
  for (const device of fake.discoveredDevices) {
    await fake.deviceCreated(device);
  }
  await settle();
}
