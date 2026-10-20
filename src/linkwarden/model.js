// -----------------------------------------------------------------------------
// Linkwarden answers -> plain values: link summaries, collections, tags typed
// by the user, collection lookup. No I/O here.
// -----------------------------------------------------------------------------

const clean = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

/** `https://www.example.org/a` -> `example.org`; '' when not a URL. */
export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * The few fields Gladys shows of a link. Linkwarden names a link after its
 * page title, or after its URL when the page could not be read.
 * @param {object} link a Linkwarden link
 */
export function summarizeLink(link) {
  const url = typeof link?.url === 'string' ? link.url : '';
  const rawName = clean(link?.name);
  const name = rawName && rawName !== url ? rawName : domainOf(url) || url || rawName;
  return {
    id: Number.isInteger(link?.id) ? link.id : 0,
    name,
    url,
    description: clean(link?.description),
    collectionId: Number.isInteger(link?.collectionId) ? link.collectionId : null,
    collection: clean(link?.collection?.name),
    tags: Array.isArray(link?.tags) ? link.tags.map((tag) => clean(tag?.name)).filter(Boolean) : [],
    pinned: Array.isArray(link?.pinnedBy) && link.pinnedBy.length > 0,
    imported: Boolean(link?.importDate),
    created: String(link?.createdAt ?? ''),
  };
}

/** `[{ id, name, parent, links }]` from `/collections`. */
export function summarizeCollections(collections) {
  return collections
    .filter((c) => Number.isInteger(c?.id))
    .map((c) => ({
      id: c.id,
      name: clean(c.name) || `#${c.id}`,
      parent: clean(c.parent?.name),
      links: Number.isFinite(c._count?.links) && c._count.links > 0 ? c._count.links : 0,
    }));
}

// Linkwarden refuses tag names over 50 characters.
export const MAX_TAG_LENGTH = 50;
export const MAX_TAGS = 20;

/** `"dinner, #italian; dinner"` -> `['dinner', 'italian']` */
export function parseTags(raw) {
  if (typeof raw !== 'string') {
    return [];
  }
  const seen = new Set();
  const tags = [];
  for (const part of raw.split(/[,;\n]/)) {
    const tag = clean(part).replace(/^#+/, '').slice(0, MAX_TAG_LENGTH).trim();
    const key = tag.toLocaleLowerCase();
    if (tag !== '' && !seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }
  return tags.slice(0, MAX_TAGS);
}

const fold = (value) => clean(value).normalize('NFC').toLocaleLowerCase();

/**
 * The collection of that name (case-insensitive), a top-level one first when
 * a sub-collection bears the same name; `Parent/Child` picks a sub-collection.
 * Undefined when none.
 */
export function findCollection(collections, name) {
  const wanted = fold(name);
  const matches = collections.filter((c) => fold(c.name) === wanted);
  if (matches.length > 0) {
    return matches.find((c) => c.parent === '') ?? matches[0];
  }
  const slash = wanted.lastIndexOf('/');
  if (slash > 0) {
    const parent = wanted.slice(0, slash).trim();
    const child = wanted.slice(slash + 1).trim();
    return collections.find((c) => fold(c.name) === child && fold(c.parent) === parent);
  }
  return undefined;
}

/**
 * A link typed in a form or a scene: `https://...`, `http://...`, or
 * `www.example.org/...` (https assumed). Null when it is not one.
 */
export function asLink(raw) {
  const text = clean(raw);
  if (/\s/.test(text) || text === '' || text.length > 2048) {
    return null;
  }
  const candidate = /^www\./i.test(text) ? `https://${text}` : text;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? candidate : null;
  } catch {
    return null;
  }
}
