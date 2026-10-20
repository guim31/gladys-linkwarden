// -----------------------------------------------------------------------------
// The "Linkwarden" dashboard widget: counters (links, added today,
// collections — or the links of the collection set in the widget), the newest
// links, and a "Save" button opening a form (Gladys 5.2.0 or later). Set to a
// collection, the widget lists and saves in that collection.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { collectionLabel } from './devices.js';
import { CommandError, WIDGET_KEY } from './hub.js';
import { domainOf } from './linkwarden/model.js';
import { NAMES, SAVED_TEXT, commandMessage, pick } from './texts.js';

export const MAX_ITEMS = 6;
export const SAVE_ACTION = 'save';

export const TEXT = {
  today: { en: 'Today', fr: "Aujourd'hui", de: 'Heute', es: 'Hoy' },
  pinned: { en: 'Pinned', fr: 'Épinglé', de: 'Angeheftet', es: 'Fijado' },
  save: {
    en: 'Save a link',
    fr: 'Enregistrer un lien',
    de: 'Link speichern',
    es: 'Guardar enlace',
  },
  url: { en: 'Link', fr: 'Lien', de: 'Link', es: 'Enlace' },
  open: { en: 'Open the link', fr: 'Ouvrir le lien', de: 'Link öffnen', es: 'Abrir el enlace' },
  open_linkwarden: {
    en: 'Open in Linkwarden',
    fr: 'Ouvrir dans Linkwarden',
    de: 'In Linkwarden öffnen',
    es: 'Abrir en Linkwarden',
  },
  empty: {
    en: 'No link to show yet.',
    fr: 'Aucun lien à afficher pour le moment.',
    de: 'Noch kein Link anzuzeigen.',
    es: 'Todavía no hay ningún enlace que mostrar.',
  },
  unavailable: {
    en: 'Linkwarden does not answer right now.',
    fr: 'Linkwarden ne répond pas pour le moment.',
    de: 'Linkwarden antwortet gerade nicht.',
    es: 'Linkwarden no responde en este momento.',
  },
  waiting: {
    en: 'Waiting for Linkwarden: check the configuration of the integration.',
    fr: "En attente de Linkwarden : vérifiez la configuration de l'intégration.",
    de: 'Warte auf Linkwarden: Prüfe die Konfiguration der Integration.',
    es: 'Esperando a Linkwarden: compruebe la configuración de la integración.',
  },
};

const cut = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);
const https = (url) => typeof url === 'string' && /^https:\/\//i.test(url);

function shortDate(iso, language) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(
    { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' }[language] ?? 'en-GB',
    { day: 'numeric', month: 'short' },
  );
}

/** One row of the list; the collection is shown when the widget lists them all. */
export function linkItem(link, language, baseUrl, showCollection) {
  const parts = [
    domainOf(link.url),
    showCollection ? link.collection : '',
    shortDate(link.created, language),
  ];
  const item = {
    title: cut(link.name || link.url || '…', 60),
    subtitle: cut(parts.filter(Boolean).join(' · '), 60),
  };
  if (link.pinned) {
    item.badge = { text: pick(TEXT.pinned, language), color: WIDGET_COLORS.WARNING };
  }
  if (link.description) {
    item.description = cut(link.description, 2000);
  }
  const links = [];
  if (https(link.url)) {
    links.push({ url: link.url.slice(0, 2000), label: pick(TEXT.open, language) });
  }
  // The links of a card must be https: a Linkwarden on plain http is left out.
  if (https(baseUrl) && link.id) {
    links.push({ url: `${baseUrl}/links/${link.id}`, label: pick(TEXT.open_linkwarden, language) });
  }
  if (links.length > 0) {
    item.links = links;
  }
  return item;
}

// The core wants the labels of form fields as multi-language objects.
function saveButton(language) {
  return {
    type: 'button',
    label: pick(TEXT.save, language),
    icon: 'plus',
    style: 'secondary',
    action: {
      key: SAVE_ACTION,
      fields: [{ key: 'url', type: 'string', required: true, label: TEXT.url }],
    },
  };
}

export async function buildContent(hub, { language = 'en', settings = {} } = {}) {
  if (!hub.loaded) {
    return {
      ttl_seconds: 60,
      components: [{ type: 'text', variant: 'body', text: pick(TEXT.waiting, language) }],
    };
  }
  const collection = hub.collectionOf(settings?.collection);
  const names = pick(NAMES, language);
  const components = collection
    ? [
        {
          type: 'value',
          label: cut(collectionLabel(collection), 24),
          value: collection.links,
          icon: 'folder',
        },
      ]
    : [
        { type: 'value', label: names.links, value: hub.counters.links, icon: 'link' },
        {
          type: 'value',
          label: pick(TEXT.today, language),
          value: hub.counters.today,
          icon: 'plus-circle',
        },
        {
          type: 'value',
          label: names.collections,
          value: hub.counters.collections,
          icon: 'folder',
        },
      ];
  const links = await hub.widgetLinks(collection, MAX_ITEMS);
  if (links === null) {
    components.push({ type: 'text', variant: 'caption', text: pick(TEXT.unavailable, language) });
  } else if (links.length === 0) {
    components.push({ type: 'text', variant: 'caption', text: pick(TEXT.empty, language) });
  } else {
    components.push({
      type: 'card-list',
      display: 'list',
      items: links.map((l) => linkItem(l, language, hub.config.url ?? '', !collection)),
    });
  }
  components.push(saveButton(language));
  // The hub nudges the widget after every read and every save.
  return { ttl_seconds: 300, components };
}

async function action(hub, { actionKey, values, settings }) {
  const language = hub.language;
  if (actionKey !== SAVE_ACTION) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  if (!values || typeof values.url !== 'string') {
    // A Gladys older than 5.2.0 relays the tap without the form.
    throw new Error(pick(commandMessage('form'), language));
  }
  const collection = hub.collectionOf(settings?.collection);
  try {
    const saved = await hub.save({ url: values.url, collection });
    const key = saved.existed ? 'existed' : 'saved';
    return {
      message: Object.fromEntries(
        Object.entries(SAVED_TEXT).map(([lang, table]) => [lang, table[key]]),
      ),
    };
  } catch (err) {
    if (err instanceof CommandError) {
      throw new Error(pick(err.messages, language), { cause: err });
    }
    throw err;
  }
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    get: (hub, request) => buildContent(hub, request),
    action,
  },
};
