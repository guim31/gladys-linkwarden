// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface, with the words of the Linkwarden interface (fr "lien",
// "étiquette", de "Link", "Sammlung", es "enlace", "colección"). German says
// "du", Spanish "usted" (test/i18n.test.js).
// -----------------------------------------------------------------------------

// Feature names (frozen by Gladys at creation).
export const NAMES = {
  en: {
    links: 'Links',
    today: 'Links added today',
    collections: 'Collections',
    latest: 'Latest link',
  },
  fr: {
    links: 'Liens',
    today: "Liens ajoutés aujourd'hui",
    collections: 'Collections',
    latest: 'Dernier lien',
  },
  de: {
    links: 'Links',
    today: 'Heute hinzugefügte Links',
    collections: 'Sammlungen',
    latest: 'Neuester Link',
  },
  es: {
    links: 'Enlaces',
    today: 'Enlaces añadidos hoy',
    collections: 'Colecciones',
    latest: 'Último enlace',
  },
};

/** The "Latest link" text of an empty Linkwarden. */
export const NONE = { en: 'None', fr: 'Aucun', de: 'Keiner', es: 'Ninguno' };

export const STATUS_TEXT = {
  en: {
    none: 'Enter the address of Linkwarden and an access token in the configuration.',
    invalid: 'The Linkwarden address is not valid: enter an address like 192.168.1.50:3000.',
    token: 'Enter an access token (Linkwarden → Settings → Access Tokens).',
    unauthorized:
      'Linkwarden refused the access token: create a new one in Settings → Access Tokens.',
    unreachable: 'Linkwarden does not answer: check its address and that it is running.',
    invalid_answer:
      'This address does not answer like Linkwarden 2.10 or later: check the address and the port.',
  },
  fr: {
    none: "Saisissez l'adresse de Linkwarden et un jeton d'accès dans la configuration.",
    invalid:
      "L'adresse de Linkwarden n'est pas valide : saisissez une adresse comme 192.168.1.50:3000.",
    token: "Saisissez un jeton d'accès (Linkwarden → Paramètres → Jetons d'accès).",
    unauthorized:
      "Linkwarden a refusé le jeton d'accès : créez-en un nouveau dans Paramètres → Jetons d'accès.",
    unreachable: "Linkwarden ne répond pas : vérifiez son adresse et qu'il est démarré.",
    invalid_answer:
      "Cette adresse ne répond pas comme Linkwarden 2.10 ou plus : vérifiez l'adresse et le port.",
  },
  de: {
    none: 'Gib in der Konfiguration die Adresse von Linkwarden und ein Zugangstoken ein.',
    invalid: 'Die Linkwarden-Adresse ist ungültig: Gib eine Adresse wie 192.168.1.50:3000 ein.',
    token: 'Gib ein Zugangstoken ein (Linkwarden → Einstellungen → Zugangstoken).',
    unauthorized:
      'Linkwarden hat das Zugangstoken abgelehnt: Erstelle ein neues unter Einstellungen → Zugangstoken.',
    unreachable: 'Linkwarden antwortet nicht: Prüfe die Adresse und ob es läuft.',
    invalid_answer:
      'Diese Adresse antwortet nicht wie Linkwarden 2.10 oder neuer: Prüfe Adresse und Port.',
  },
  es: {
    none: 'Introduzca la dirección de Linkwarden y un token de acceso en la configuración.',
    invalid:
      'La dirección de Linkwarden no es válida: introduzca una dirección como 192.168.1.50:3000.',
    token: 'Introduzca un token de acceso (Linkwarden → Ajustes → Tokens de acceso).',
    unauthorized:
      'Linkwarden rechazó el token de acceso: cree uno nuevo en Ajustes → Tokens de acceso.',
    unreachable: 'Linkwarden no responde: compruebe su dirección y que esté en marcha.',
    invalid_answer:
      'Esta dirección no responde como Linkwarden 2.10 o posterior: compruebe la dirección y el puerto.',
  },
};

/** "Test the connection" once Linkwarden answered. */
export const TEST_TEXT = {
  en: (user, links, collections) =>
    `Connected to Linkwarden as ${user}: ${links} link(s), ${collections} collection(s).`,
  fr: (user, links, collections) =>
    `Connecté à Linkwarden en tant que ${user} : ${links} lien(s), ${collections} collection(s).`,
  de: (user, links, collections) =>
    `Mit Linkwarden verbunden als ${user}: ${links} Link(s), ${collections} Sammlung(en).`,
  es: (user, links, collections) =>
    `Conectado a Linkwarden como ${user}: ${links} enlace(s), ${collections} colección(es).`,
};

export const INIT_FAILED = {
  en: 'The integration could not start: see its logs.',
  fr: "L'intégration n'a pas pu démarrer : consultez ses journaux.",
  de: 'Die Integration konnte nicht starten: Sieh dir ihre Logs an.',
  es: 'La integración no pudo iniciarse: consulte sus registros.',
};

// Errors of the scene actions and of the widget form. `{name}` is the
// collection name, `{detail}` the reason Linkwarden gave.
export const COMMAND_ERRORS = {
  en: {
    timeout: 'Linkwarden answered too late: the link may have been saved anyway.',
    http: 'Linkwarden could not save the link: {detail}',
    read: 'Linkwarden could not be read: {detail}',
    url: 'Enter a link starting with http:// or https://.',
    unreachable: 'Linkwarden does not answer: nothing was done.',
    unauthorized: 'Linkwarden refused the access token: nothing was done.',
    collection: 'No collection "{name}" in Linkwarden.',
    rejected: 'Linkwarden refused the link: {detail}',
    form: 'Update Gladys to 5.2 or later to use this form.',
  },
  fr: {
    timeout: 'Linkwarden a répondu trop tard : le lien a peut-être été enregistré quand même.',
    http: "Linkwarden n'a pas pu enregistrer le lien : {detail}",
    read: "Linkwarden n'a pas pu être lu : {detail}",
    url: 'Saisissez un lien commençant par http:// ou https://.',
    unreachable: "Linkwarden ne répond pas : rien n'a été fait.",
    unauthorized: "Linkwarden a refusé le jeton d'accès : rien n'a été fait.",
    collection: 'Aucune collection « {name} » dans Linkwarden.',
    rejected: 'Linkwarden a refusé le lien : {detail}',
    form: 'Mettez Gladys à jour (5.2 ou plus) pour utiliser ce formulaire.',
  },
  de: {
    timeout: 'Linkwarden hat zu spät geantwortet: Der Link wurde vielleicht trotzdem gespeichert.',
    http: 'Linkwarden konnte den Link nicht speichern: {detail}',
    read: 'Linkwarden konnte nicht gelesen werden: {detail}',
    url: 'Gib einen Link ein, der mit http:// oder https:// beginnt.',
    unreachable: 'Linkwarden antwortet nicht: Es wurde nichts getan.',
    unauthorized: 'Linkwarden hat das Zugangstoken abgelehnt: Es wurde nichts getan.',
    collection: 'Keine Sammlung „{name}“ in Linkwarden.',
    rejected: 'Linkwarden hat den Link abgelehnt: {detail}',
    form: 'Aktualisiere Gladys auf 5.2 oder neuer, um dieses Formular zu nutzen.',
  },
  es: {
    timeout:
      'Linkwarden respondió demasiado tarde: puede que el enlace se haya guardado de todos modos.',
    http: 'Linkwarden no pudo guardar el enlace: {detail}',
    read: 'No se pudo leer Linkwarden: {detail}',
    url: 'Introduzca un enlace que empiece por http:// o https://.',
    unreachable: 'Linkwarden no responde: no se ha hecho nada.',
    unauthorized: 'Linkwarden rechazó el token de acceso: no se ha hecho nada.',
    collection: 'No hay ninguna colección «{name}» en Linkwarden.',
    rejected: 'Linkwarden rechazó el enlace: {detail}',
    form: 'Actualice Gladys a la versión 5.2 o posterior para usar este formulario.',
  },
};

/** The toast of the widget form. */
export const SAVED_TEXT = {
  en: { saved: 'Link saved in Linkwarden.', existed: 'Link already in Linkwarden.' },
  fr: {
    saved: 'Lien enregistré dans Linkwarden.',
    existed: 'Lien déjà présent dans Linkwarden.',
  },
  de: { saved: 'Link in Linkwarden gespeichert.', existed: 'Link ist schon in Linkwarden.' },
  es: { saved: 'Enlace guardado en Linkwarden.', existed: 'El enlace ya está en Linkwarden.' },
};

/** A coded message in every language, details filled in. */
export function commandMessage(code, values = {}) {
  return Object.fromEntries(
    Object.entries(COMMAND_ERRORS).map(([language, table]) => [
      language,
      (table[code] ?? table.unreachable)
        .replace('{name}', values.name ?? '')
        .replace('{detail}', values.detail ?? '')
        .slice(0, 200),
    ]),
  );
}

export const pick = (table, language) => table[language] ?? table.en;
