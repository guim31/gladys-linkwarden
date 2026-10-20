# Linkwarden for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for
[Linkwarden](https://github.com/linkwarden/linkwarden), the self-hosted app to
collect, organize and preserve links: follow your counters, react when a link
is saved in a collection, save links from scenes or from the dashboard, and
read the newest ones in a message. Local only.

Tested against a real Linkwarden 2.16.3 server (official Docker image).

## Features

- **A Linkwarden device**: links, links added today, collections, and the name
  of the latest link.
- **One device per collection**: its number of links. Add the ones you follow.
- **Dashboard widget** "Linkwarden": three tiles, the newest links (of every
  collection or of one) with their links, and a **Save a link** button opening
  a form.
- **Scene trigger** "New link", filtered by collection, silent at
  installation, remembered across restarts.
- **Scene actions**: "Save a link in Linkwarden" (in an existing collection,
  with tags) and "Read the latest Linkwarden links" (to send them in a
  message).
- Texts in English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.2 or later (the widget form).
- Linkwarden 2.10 or later, reachable from Gladys (port 3000 by default), and
  an access token (Linkwarden → Settings → Access Tokens).

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-linkwarden` (or find **Linkwarden** in the
   catalog).
2. In **Configuration**, enter the address of Linkwarden (`192.168.1.50`, port
   3000 by default) and the access token. Save.
3. Add the **Linkwarden** device, and the collections you want, from the
   **Discover** tab.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

Linkwarden pushes nothing: the container reads it every 30 minutes by default
(5 to 60), and just after midnight, with two requests — `/collections` (with
the number of links of each) and the newest page of `/search` (50 links,
newest first; more pages only when more links were added since midnight or
since the previous read). The devices are published with `should_poll: false`;
only changed states are sent to Gladys. Saves use `POST /links` of the REST API
v1, always with the id of an existing collection.

## Limitations

- One Linkwarden user, the owner of the token.
- The trigger fires at the next read, not instantly; at most ten events per
  read; imports are not announced.
- Nothing is ever deleted, moved or archived in Linkwarden.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys and a fake Linkwarden answering
with bodies recorded on a real Linkwarden 2.16.3 server
(`test/fixtures/linkwarden/`).

## Credits

- [Linkwarden](https://github.com/linkwarden/linkwarden), by Daniel31x13 and
  contributors (AGPL-3.0): this integration only talks to its REST API and
  contains none of its code.
- The cover shows the Linkwarden logo, taken from the
  [Linkwarden repository](https://github.com/linkwarden/linkwarden)
  (AGPL-3.0); the logo is a trademark of its owners.

## Disclaimer

This project is not affiliated with, endorsed or sponsored by the Linkwarden
project.

## License

Apache-2.0, see [`LICENSE`](LICENSE).
