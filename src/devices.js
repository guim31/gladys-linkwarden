// -----------------------------------------------------------------------------
// Linkwarden -> Gladys devices:
// - one "Linkwarden" device per user (`linkwarden:<user uuid>`, the owner of
//   the token): links, links added today, collections, latest link;
// - one device per collection (`collection:<user uuid>_<collection id>`): its
//   number of links. Every collection is offered in Discovery; the user adds
//   the ones they care about.
// Everything is read only: links are saved through the scene action and the
// widget form, never through a device feature.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPE,
} from '@gladysassistant/integration-sdk';
import { NAMES, NONE, pick } from './texts.js';

export const LINKWARDEN_TYPE = 'linkwarden';
export const COLLECTION_TYPE = 'collection';
export const COUNTERS = ['links', 'today', 'collections'];
// Gladys keeps every discovered device in its list: a server with hundreds
// of collections offers the first ones only.
export const MAX_COLLECTIONS = 100;

const MAX_COUNT = 10_000_000;

export const linkwardenIds = (gladys, userUuid) => gladys.externalIds(LINKWARDEN_TYPE, userUuid);
export const collectionIds = (gladys, userUuid, collectionId) =>
  gladys.externalIds(COLLECTION_TYPE, `${userUuid}_${collectionId}`);

const counter = (name, externalId) => ({
  name,
  external_id: externalId,
  category: CAT.COUNTER_SENSOR,
  type: TYPE.SENSOR.INTEGER,
  read_only: true,
  has_feedback: false,
  min: 0,
  max: MAX_COUNT,
  keep_history: true,
});

/**
 * @param {object} gladys
 * @param {{ uuid: string, name: string }} user
 * @param {string} language
 * @param {string} url Linkwarden base URL (a device param, shown in Gladys)
 */
export function buildLinkwardenDevice(gladys, user, language, url) {
  const names = pick(NAMES, language);
  const ids = linkwardenIds(gladys, user.uuid);
  return {
    name: 'Linkwarden',
    external_id: ids.device,
    model: 'Linkwarden',
    should_poll: false,
    features: [
      ...COUNTERS.map((key) => counter(names[key], ids.feature(key))),
      {
        name: names.latest,
        external_id: ids.feature('latest'),
        category: CAT.TEXT,
        type: TYPE.TEXT.TEXT,
        read_only: true,
        has_feedback: false,
        min: 0,
        max: 0,
        keep_history: false,
      },
    ],
    params: [
      { name: 'LINKWARDEN_URL', value: url },
      { name: 'LINKWARDEN_USER', value: user.name.slice(0, 100) },
    ],
  };
}

/** "Recipes", or "Kitchen / Recipes" for a sub-collection. */
export const collectionLabel = (collection) =>
  (collection.parent ? `${collection.parent} / ${collection.name}` : collection.name).slice(0, 100);

/**
 * @param {object} gladys
 * @param {string} userUuid
 * @param {{ id: number, name: string, parent: string }} collection
 * @param {string} language
 */
export function buildCollectionDevice(gladys, userUuid, collection, language) {
  const ids = collectionIds(gladys, userUuid, collection.id);
  return {
    name: collectionLabel(collection),
    external_id: ids.device,
    model: 'Linkwarden collection',
    should_poll: false,
    features: [counter(pick(NAMES, language).links, ids.feature('links'))],
    params: [{ name: 'LINKWARDEN_COLLECTION_ID', value: String(collection.id) }],
  };
}

/**
 * @param {object} gladys
 * @param {string} userUuid
 * @param {{ links: number, today: number, collections: number }} counters
 * @param {{ name: string } | undefined} latest the newest link
 * @param {string} language
 */
export function buildLinkwardenStates(gladys, userUuid, counters, latest, language) {
  const ids = linkwardenIds(gladys, userUuid);
  return [
    ...COUNTERS.map((key) => ({
      device_feature_external_id: ids.feature(key),
      state: counters[key],
    })),
    {
      device_feature_external_id: ids.feature('latest'),
      text: (latest?.name || pick(NONE, language)).slice(0, 200),
    },
  ];
}

export function buildCollectionStates(gladys, userUuid, collection) {
  return [
    {
      device_feature_external_id: collectionIds(gladys, userUuid, collection.id).feature('links'),
      state: collection.links,
    },
  ];
}

/**
 * `ext:...:linkwarden:<uuid>` -> { kind: 'linkwarden', user }, and
 * `ext:...:collection:<uuid>_<id>` -> { kind: 'collection', user, collectionId };
 * null when not ours.
 */
export function parseExternalId(gladys, externalId) {
  if (typeof externalId !== 'string') {
    return null;
  }
  for (const kind of [LINKWARDEN_TYPE, COLLECTION_TYPE]) {
    const prefix = gladys.externalId(`${kind}:`);
    if (!externalId.startsWith(prefix)) {
      continue;
    }
    const id = externalId.slice(prefix.length).split(':')[0];
    if (kind === LINKWARDEN_TYPE) {
      return id === '' ? null : { kind, user: id };
    }
    const cut = id.lastIndexOf('_');
    const collectionId = Number(id.slice(cut + 1));
    if (cut <= 0 || !Number.isInteger(collectionId)) {
      return null;
    }
    return { kind, user: id.slice(0, cut), collectionId };
  }
  return null;
}
