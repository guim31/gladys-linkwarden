# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-22

### Security

- Rebuilt on Node.js 24.22.1, the October 2026 security release (remote code
  execution in the Brotli decoder, CVE-2026-111497; TLS hostname and DNS
  fixes).

## [1.0.0] - 2026-10-20

### Added

- A Linkwarden device: links, links added today, collections, and the name of
  the latest link; one device per collection with its number of links.
- The "Linkwarden" dashboard widget: three tiles, the newest links (of every
  collection or of one) and a form to save a link.
- Scene trigger "New link", filtered by collection, silent at installation,
  remembered across restarts.
- Scene actions "Save a link in Linkwarden" (collection, tags) and "Read the
  latest Linkwarden links" (to send them in a message).
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-linkwarden/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-linkwarden/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/guim31/gladys-linkwarden/releases/tag/v1.0.0
