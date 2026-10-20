// -----------------------------------------------------------------------------
// The hub: the link to one Linkwarden account and everything Gladys sees of
// it — the devices, their states, the connection status, the scene events,
// and the links saved or read from scenes and from the widget.
//
// Linkwarden pushes nothing: the container reads it every `refresh_minutes`
// (30 by default) on its own timer (should_poll: false), and just after
// midnight so that "links added today" falls back to 0. A read is three
// requests in the normal case: the user (once), the collections with their
// counts, and the newest page of links (more pages only when more than 50
// links were added since midnight or since the previous read).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  MAX_COLLECTIONS,
  buildCollectionDevice,
  buildCollectionStates,
  buildLinkwardenDevice,
  buildLinkwardenStates,
  collectionIds,
  linkwardenIds,
  parseExternalId,
} from './devices.js';
import { LinkwardenClient, LinkwardenError } from './linkwarden/client.js';
import {
  asLink,
  findCollection,
  parseTags,
  summarizeCollections,
  summarizeLink,
} from './linkwarden/model.js';
import { MemoryStore } from './store.js';
import { STATUS_TEXT, TEST_TEXT, commandMessage } from './texts.js';

const logger = createLogger({ name: 'linkwarden-hub' });

export const WIDGET_KEY = 'links';
export const TRIGGERS = { added: 'link_added' };

export const DEFAULT_TIMINGS = {
  // requestWidgetRefresh is dropped by the core beyond one call per 10 s.
  widgetGap: 10_500,
  // An unchanged value is sent again before Gladys calls it stale (48 h).
  heartbeat: 6 * 3_600_000,
  requestTimeout: 15_000,
  // How long the links of one collection, read for a widget, are reused.
  widgetCache: 60_000,
  // The read after midnight waits a little for the clock to be past it.
  midnightDelay: 5_000,
};

export const LATEST_COUNT = 20;
// Pages of 50 links: past 500 links added since midnight (or since the last
// read), the count of the day stops there and the oldest are not announced.
export const MAX_PAGES = 10;
// An import or a burst of saves can bring many links at once: past that many
// events in one read, the rest is recorded as seen without firing.
export const MAX_EVENTS_PER_READ = 10;
// The links saved by the integration itself are never announced (a scene
// bound to "New link" that saves one would loop).
const MAX_OWN = 200;

/** An Error carrying a coded, multi-language message. */
export class CommandError extends Error {
  constructor(code, language, values) {
    const messages = commandMessage(code, values);
    super(messages[language] ?? messages.en);
    this.code = code;
    this.messages = messages;
  }
}

const linkOf = (config) => JSON.stringify([config.url, config.token]);

/** Local midnight (the TZ of Gladys, injected by its supervisor) of a time. */
export function startOfDay(time) {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export class Hub {
  constructor({ gladys, fetch, timings, now = Date.now, store }) {
    this.gladys = gladys;
    this.fetch = fetch;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.now = now;
    this.store = store ?? new MemoryStore();
    this.config = { url: null, urlInvalid: false, token: '', refreshMinutes: 30, language: 'fr' };
    this.client = null;
    /** the owner of the token: { id, uuid, name } */
    this.user = null;
    /** [{ id, name, parent, links }] */
    this.collections = [];
    /** { links, today, collections } */
    this.counters = null;
    /** the newest links, summarized */
    this.latest = [];
    /** null (fine), or the kind of the last failure */
    this.failure = null;
    this.announced = false;
    this.lastStatus = '';
    /** what the trigger already saw: { user, lastId } */
    this.seen = null;
    this.own = new Set();
    this.eventFailing = false;
    this.devicesFailing = false;
    this.publishFailing = false;
    this.widgetLists = new Map();
    this.configuring = Promise.resolve();
    this.refreshTimer = null;
    this.midnightTimer = null;
    this.refreshing = null;
    this.refreshAgain = false;
    this.widgetRefreshAt = 0;
    this.widgetTimer = null;
    this.stopped = false;
  }

  get language() {
    return this.config.language;
  }

  get loaded() {
    return this.counters !== null;
  }

  async start(config) {
    const saved = await this.store.load();
    // A damaged file is a new baseline, not a crash on every read.
    this.seen =
      typeof saved.user === 'string' && Number.isInteger(saved.lastId) && saved.lastId >= 0
        ? { user: saved.user, lastId: saved.lastId }
        : null;
    this.#scheduleMidnight();
    await this.reconfigure(config);
  }

  /** One configuration change at a time: a second one waits for the first. */
  reconfigure(config) {
    const run = this.configuring.then(() => this.#reconfigure(config));
    this.configuring = run.catch(() => {});
    return run;
  }

  async #reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const linkChanged = linkOf(previous) !== linkOf(config) || !this.client;
    if (linkChanged || previous.refreshMinutes !== config.refreshMinutes) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (linkChanged) {
      this.client = null;
      this.user = null;
      this.collections = [];
      this.counters = null;
      this.latest = [];
      this.failure = null;
      this.announced = false;
      this.widgetLists.clear();
      if (config.url && config.token) {
        this.client = new LinkwardenClient({
          url: config.url,
          token: config.token,
          fetch: this.fetch,
          timeout: this.timings.requestTimeout,
        });
      }
    }
    if (this.client && !this.refreshTimer) {
      this.refreshTimer = setInterval(
        () => this.refresh().catch((err) => logger.error('Read failed', err)),
        config.refreshMinutes * 60_000,
      );
      this.refreshTimer.unref?.();
    }
    if (linkChanged) {
      await this.refresh();
    } else {
      // Language or interval only: same data, new names and texts.
      this.gladys.forgetPublishedStates?.();
      await this.#update();
    }
    await this.updateConnectionStatus();
  }

  /** Gladys reconnected (it may have restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.lastStatus = '';
    await this.reconfigure(config);
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.refreshTimer);
    clearTimeout(this.midnightTimer);
    clearTimeout(this.widgetTimer);
    this.refreshTimer = null;
    await this.store.flush();
  }

  /** A read just after local midnight: the count of the day starts again. */
  #scheduleMidnight() {
    if (this.stopped) {
      return;
    }
    const now = this.now();
    const tomorrow = new Date(startOfDay(now));
    tomorrow.setDate(tomorrow.getDate() + 1);
    const wait = tomorrow.getTime() - now + this.timings.midnightDelay;
    this.midnightTimer = setTimeout(() => {
      this.#scheduleMidnight();
      if (this.client) {
        this.refresh().catch((err) => logger.error('Read failed', err));
      }
    }, wait);
    this.midnightTimer.unref?.();
  }

  // --- Reading Linkwarden ---------------------------------------------------

  /** Read Linkwarden (one read at a time; a request during it runs once after). */
  refresh() {
    if (this.refreshing) {
      this.refreshAgain = true;
      return this.refreshing;
    }
    this.refreshing = (async () => {
      do {
        this.refreshAgain = false;
        try {
          await this.#refreshOnce();
        } catch (err) {
          // Never ends the loop: a read queued meanwhile (new address) still runs.
          logger.error('Read failed', err);
        }
      } while (this.refreshAgain && !this.stopped);
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async #refreshOnce() {
    const client = this.client;
    if (this.stopped) {
      return;
    }
    if (!client) {
      await this.publishDevices();
      return;
    }
    const midnight = startOfDay(this.now());
    let user;
    let collections;
    let recent;
    try {
      user = this.user ?? (await client.me());
      const uuid = user.uuid ?? String(user.id);
      const known = this.seen?.user === uuid ? this.seen : null;
      // Pages until the oldest link is older than midnight and already seen.
      const enough = (page) => {
        const oldest = page.at(-1);
        return (
          !oldest ||
          (Date.parse(oldest.createdAt) < midnight && (!known || oldest.id <= known.lastId))
        );
      };
      [collections, recent] = await Promise.all([
        client.collections(),
        client.recentLinks(enough, MAX_PAGES),
      ]);
    } catch (err) {
      if (client !== this.client) {
        return;
      }
      this.#fail(err);
      await this.updateConnectionStatus();
      return;
    }
    if (client !== this.client || this.stopped) {
      return;
    }
    this.user = {
      id: user.id,
      uuid: user.uuid ?? String(user.id),
      name: user.name || user.username || String(user.id),
    };
    const links = recent.map(summarizeLink);
    this.collections = summarizeCollections(collections);
    this.counters = {
      links: this.collections.reduce((sum, c) => sum + c.links, 0),
      today: links.filter((l) => Date.parse(l.created) >= midnight).length,
      collections: this.collections.length,
    };
    this.latest = links.slice(0, LATEST_COUNT);
    this.widgetLists.clear();
    this.#recover();
    await this.#update();
    await this.#announce(links);
    await this.updateConnectionStatus();
  }

  /** Devices, states and widget from the last read. */
  async #update() {
    await this.publishDevices();
    await this.publishStates();
    this.refreshWidget();
  }

  #fail(err) {
    const kind = err instanceof LinkwardenError ? err.kind : 'unreachable';
    if (this.failure === null) {
      logger.warn(`Linkwarden: ${err.message}`);
    } else {
      logger.debug(`Linkwarden still failing: ${err.message}`);
    }
    this.failure = kind;
    if (kind === 'unauthorized' || kind === 'invalid' || kind === 'not_found') {
      // Another token may belong to another user.
      this.user = null;
    }
  }

  #recover() {
    const count = this.counters.links;
    if (this.failure !== null) {
      logger.info(`Linkwarden answers again (${count} links)`);
    } else if (!this.announced) {
      logger.info(`Connected to Linkwarden (${count} links)`);
    }
    this.announced = true;
    this.failure = null;
  }

  // --- Scene events ---------------------------------------------------------

  /**
   * Fire the links added since the last read, the oldest first. The first
   * read of a Linkwarden user is a silent baseline: installing the
   * integration announces nothing already there. Link ids only grow, so the
   * highest id seen is all there is to remember.
   * @param {object[]} links the newest links, summarized
   */
  async #announce(links) {
    const uuid = this.user.uuid;
    const known = this.seen?.user === uuid ? this.seen : null;
    const newest = links.reduce((max, l) => Math.max(max, l.id), known?.lastId ?? 0);
    let lastId = newest;
    if (known) {
      const added = links
        .filter((l) => l.id > known.lastId && !this.own.has(l.id) && !l.imported)
        .sort((a, b) => a.id - b.id);
      if (added.length > MAX_EVENTS_PER_READ) {
        logger.info(`${added.length} new links at once: ${MAX_EVENTS_PER_READ} announced`);
      }
      for (const link of added.slice(0, MAX_EVENTS_PER_READ)) {
        logger.debug(`${TRIGGERS.added}: ${link.id}`);
        try {
          await this.gladys.publishSceneEvent(TRIGGERS.added, this.#eventData(link));
          if (this.eventFailing) {
            logger.info('Scene events accepted again');
          }
          this.eventFailing = false;
        } catch (err) {
          if (this.eventFailing) {
            logger.debug(`Cannot fire ${TRIGGERS.added}: ${err.message}`);
          } else {
            logger.warn(`Cannot fire ${TRIGGERS.added}: ${err.message}`);
          }
          this.eventFailing = true;
          // A refusal for good (4xx but 429) is not retried: it would be
          // refused at every read. Otherwise (Gladys restarting), this link
          // and the next ones are fired again at the next read.
          const status = err?.status;
          const final = Number.isInteger(status) && status >= 400 && status < 500 && status !== 429;
          if (!final) {
            lastId = link.id - 1;
            break;
          }
        }
      }
    }
    for (const id of this.own) {
      if (id <= lastId) {
        this.own.delete(id);
      }
    }
    const next = { user: uuid, lastId };
    if (JSON.stringify(next) !== JSON.stringify(this.seen)) {
      this.seen = next;
      await this.store.save(next);
    }
  }

  #eventData(link) {
    return {
      // The filter of the trigger: the collection device, as picked in the editor.
      collection: collectionIds(this.gladys, this.user.uuid, link.collectionId).device,
      name: link.name.slice(0, 1000),
      url: link.url.slice(0, 1000),
      description: link.description.slice(0, 1000),
      collection_name: link.collection.slice(0, 1000),
      tags: link.tags.join(', ').slice(0, 1000),
      link_id: link.id,
    };
  }

  // --- Devices and states ---------------------------------------------------

  #isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  buildDevices() {
    if (!this.user || !this.counters) {
      return [];
    }
    return [
      buildLinkwardenDevice(this.gladys, this.user, this.language, this.config.url ?? ''),
      ...this.collections
        .slice(0, MAX_COLLECTIONS)
        .map((c) => buildCollectionDevice(this.gladys, this.user.uuid, c, this.language)),
    ];
  }

  async publishDevices() {
    if (this.stopped) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(this.buildDevices());
    } catch (err) {
      if (this.devicesFailing) {
        logger.debug(`Cannot publish the devices: ${err.message}`);
      } else {
        logger.warn(`Cannot publish the devices: ${err.message}`);
      }
      this.devicesFailing = true;
      return;
    }
    this.devicesFailing = false;
  }

  /**
   * The states of the devices the user added (Gladys drops the others).
   * @param {string} [justCreated] the external id of a device just added
   */
  async publishStates(justCreated) {
    if (!this.user || !this.counters || this.stopped) {
      return;
    }
    const created = (id) => id === justCreated || this.#isCreated(id);
    const uuid = this.user.uuid;
    const states = [];
    if (created(linkwardenIds(this.gladys, uuid).device)) {
      states.push(
        ...buildLinkwardenStates(this.gladys, uuid, this.counters, this.latest[0], this.language),
      );
    }
    for (const collection of this.collections.slice(0, MAX_COLLECTIONS)) {
      if (created(collectionIds(this.gladys, uuid, collection.id).device)) {
        states.push(...buildCollectionStates(this.gladys, uuid, collection));
      }
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeat });
    } catch (err) {
      if (this.publishFailing) {
        logger.debug(`Cannot publish the states: ${err.message}`);
      } else {
        logger.warn(`Cannot publish the states: ${err.message}`);
      }
      this.publishFailing = true;
      return;
    }
    if (this.publishFailing) {
      logger.info('States published again');
    }
    this.publishFailing = false;
  }

  #ours(device) {
    const parsed = parseExternalId(this.gladys, device?.external_id);
    return parsed !== null && parsed.user === this.user?.uuid;
  }

  /** The user added a device: states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (!this.#ours(device)) {
      return;
    }
    this.gladys.forgetPublishedStates?.(device.external_id);
    await this.publishStates(device.external_id);
    this.refreshWidget();
  }

  /** onPoll (the devices are not polled: the container reads on its timer). */
  async poll(device) {
    if (this.#ours(device)) {
      await this.publishStates(device.external_id);
    }
  }

  // --- Widget ---------------------------------------------------------------

  /** Nudge the open dashboards, with a trailing call inside the core's 10 s gap. */
  refreshWidget() {
    if (this.stopped) {
      return;
    }
    const wait = this.widgetRefreshAt + this.timings.widgetGap - this.now();
    if (wait <= 0) {
      this.widgetRefreshAt = this.now();
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
      return;
    }
    if (!this.widgetTimer) {
      this.widgetTimer = setTimeout(() => {
        this.widgetTimer = null;
        this.refreshWidget();
      }, wait);
      this.widgetTimer.unref?.();
    }
  }

  /** The collection behind a collection device external id, or undefined. */
  collectionOf(externalId) {
    const parsed = parseExternalId(this.gladys, externalId);
    if (parsed?.kind !== 'collection' || parsed.user !== this.user?.uuid) {
      return undefined;
    }
    return this.collections.find((c) => c.id === parsed.collectionId);
  }

  /**
   * The links a widget shows: the newest of all (from the last read) or of
   * one collection (read on demand, reused a minute). Null when Linkwarden
   * cannot be read.
   * @param {{ id: number } | undefined} collection
   */
  async widgetLinks(collection, count) {
    if (!this.loaded || this.failure !== null) {
      return null;
    }
    if (!collection) {
      return this.latest.slice(0, count);
    }
    const cached = this.widgetLists.get(collection.id);
    if (cached && this.now() - cached.at < this.timings.widgetCache) {
      return cached.links.slice(0, count);
    }
    const client = this.client;
    try {
      const page = await client.links({ collectionId: collection.id });
      const links = page.links.slice(0, LATEST_COUNT).map(summarizeLink);
      if (client === this.client) {
        this.widgetLists.set(collection.id, { at: this.now(), links });
      }
      return links.slice(0, count);
    } catch (err) {
      logger.debug(`Widget list not read: ${err.message}`);
      return null;
    }
  }

  // --- Connection status ----------------------------------------------------

  statusKey() {
    if (this.config.urlInvalid) {
      return 'invalid';
    }
    if (!this.config.url) {
      return 'none';
    }
    if (!this.config.token) {
      return 'token';
    }
    if (this.failure) {
      return (
        { unauthorized: 'unauthorized', invalid: 'invalid_answer', not_found: 'invalid_answer' }[
          this.failure
        ] ?? 'unreachable'
      );
    }
    return null;
  }

  statusMessage() {
    const key = this.statusKey();
    if (!key) {
      return null;
    }
    return Object.fromEntries(
      Object.entries(STATUS_TEXT).map(([language, table]) => [language, table[key]]),
    );
  }

  async updateConnectionStatus() {
    if (this.stopped) {
      return;
    }
    // Nothing to say before the first answer or failure.
    if (this.client && !this.loaded && this.failure === null) {
      return;
    }
    const message = this.statusMessage();
    const connected = Boolean(this.client) && this.loaded && this.failure === null;
    const fingerprint = JSON.stringify({ connected, message });
    if (fingerprint === this.lastStatus) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(connected, message ?? undefined);
      // Recorded once Gladys took it: a failed call is sent again next time.
      this.lastStatus = fingerprint;
    } catch (err) {
      logger.warn(`Cannot set the connection status: ${err.message}`);
    }
  }

  // --- Actions --------------------------------------------------------------

  /** "Test the connection": a fresh read, then its outcome. */
  async testReport() {
    if (!this.client) {
      return this.statusMessage();
    }
    await this.refresh();
    const message = this.statusMessage();
    if (message) {
      return message;
    }
    return Object.fromEntries(
      Object.entries(TEST_TEXT).map(([language, render]) => [
        language,
        render(this.user.name, this.counters.links, this.counters.collections),
      ]),
    );
  }

  #clientOrFail() {
    if (!this.client) {
      throw new CommandError('unreachable', this.language);
    }
    return this.client;
  }

  /** A collection typed by the user, looked up in a fresh list. */
  async #resolveCollection(client, name) {
    if (name && typeof name === 'object') {
      return name; // already resolved (the collection of a widget)
    }
    const wanted = typeof name === 'string' ? name.trim() : '';
    if (wanted === '') {
      return undefined;
    }
    const found = findCollection(summarizeCollections(await client.collections()), wanted);
    if (!found) {
      throw new CommandError('collection', this.language, { name: wanted.slice(0, 100) });
    }
    return found;
  }

  /**
   * Save a link, in a collection and with tags. Used by the scene action and
   * the widget form. An unknown collection is an error, never created (a typo
   * would otherwise make a new collection).
   * @param {{ url: unknown, name?: unknown, collection?: unknown, tags?: unknown }} request
   *   `collection`: a name typed by the user, or a collection of `this.collections`
   * @returns {Promise<{ id: number | null, name: string, collection: string, existed: boolean }>}
   */
  async save({ url, name, collection, tags }) {
    const language = this.language;
    const link = asLink(url);
    if (!link) {
      throw new CommandError('url', language);
    }
    const client = this.#clientOrFail();
    const tagNames = parseTags(tags);
    const cleanName = typeof name === 'string' ? name.trim().slice(0, 2048) : '';
    let target;
    let created;
    try {
      target = await this.#resolveCollection(client, collection);
      created = await client.createLink({
        url: link,
        name: cleanName,
        collectionId: target?.id,
        tags: tagNames,
      });
    } catch (err) {
      if (err instanceof LinkwardenError && err.kind === 'duplicate') {
        // The user forbids duplicate links in Linkwarden: already there.
        logger.info('Link already saved');
        return { id: null, name: cleanName, collection: target?.name ?? '', existed: true };
      }
      throw this.#commandError(err, 'http');
    }
    this.#remember(created.id);
    const summary = summarizeLink(created);
    logger.info(
      `Link saved${target ? ' in a collection' : ''}` +
        `${tagNames.length ? `, ${tagNames.length} tag(s)` : ''}`,
    );
    // The counters and the widget follow without waiting for the timer.
    this.refresh().catch(() => {});
    return { id: created.id, name: summary.name, collection: summary.collection, existed: false };
  }

  /**
   * The newest links, of every collection or of one, read now.
   * @param {{ collection?: unknown, count?: unknown }} request
   */
  async readLatest({ collection, count }) {
    const client = this.#clientOrFail();
    const wanted = Math.min(Math.max(Math.round(Number(count)) || 5, 1), LATEST_COUNT);
    try {
      const target = await this.#resolveCollection(client, collection);
      const page = await client.links(target ? { collectionId: target.id } : {});
      return page.links.slice(0, wanted).map(summarizeLink);
    } catch (err) {
      throw this.#commandError(err, 'read');
    }
  }

  #remember(id) {
    this.own.add(id);
    if (this.own.size > MAX_OWN) {
      this.own.delete(this.own.values().next().value);
    }
  }

  #commandError(err, fallback) {
    if (err instanceof CommandError) {
      return err;
    }
    const kind = err instanceof LinkwardenError ? err.kind : 'unreachable';
    const detail = err.message.replace(/^[^:]*: /, '');
    if (kind === 'unauthorized') {
      return new CommandError('unauthorized', this.language);
    }
    if (kind === 'rejected' && fallback === 'http') {
      return new CommandError('rejected', this.language, { detail });
    }
    if (kind === 'timeout' && fallback === 'http') {
      // The request may have reached Linkwarden: the link may exist.
      return new CommandError('timeout', this.language);
    }
    if (kind === 'unreachable' || kind === 'timeout') {
      return new CommandError('unreachable', this.language);
    }
    return new CommandError(fallback, this.language, { detail });
  }
}
