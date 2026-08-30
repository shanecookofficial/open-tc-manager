# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

> **Pending tag.** This is the first public release. The maintainer will replace
> “Unreleased” with the tag date when pushing `v0.1.0` (see
> [RELEASING.md](RELEASING.md)). Until then this section describes the feature
> set that lands on `main` when the release PR merges.

First tagged release of **OpenTCM — Open Test Case Manager**: a self-hostable
app for authoring and organizing software test cases. No authentication — deploy
only on a closed or trusted network.

### Added

- **Projects** with unique names and a configurable case-number prefix (e.g.
  `WEB`, `API`). Prefix changes re-render display ids (`WEB-42` → `WWW-42`);
  stored integers never change and are never reused.
- **Nested directory tree** per project: create, rename, move, cycle rejection,
  and two delete modes (`trash_contents`, `move_contents_to_parent`).
- **Test cases** with markdown titles, descriptions, and ordered steps (action
  required, expected result optional). GFM tables, code blocks, and lists;
  sanitised HTML rendering.
- **REST API v1** under `/api/v1` (projects, tree, directories, cases, trash,
  bulk trash/restore/purge, health). JSON error envelope; pagination on case
  lists (`page`, `pageSize`, `q`, `directoryId`).
- **Web UI:** project switcher, collapsible tree, paginated/searchable case
  list, case detail, create/edit with step reorder, selection mode and bulk
  trash, trash view with restore and typed-confirm permanent delete.
- **Soft delete + trash.** Restore returns a case to its folder, or project
  root if that folder is gone. Permanent delete (single or bulk purge) only
  from the trash, behind typed confirmation.
- **Docker production image** (`ghcr.io/shanecookofficial/opentcm`) with
  migrations on container start, plus a manual PostgreSQL 16+ install path.
- **Idempotent demo seed** (`npm run db:seed`): Web App (`WEB`) and Payments
  API (`API`), nested folders, markdown-rich cases, a 20+ step case, and a few
  already-trashed rows.

### Security

- v1 has **no login**. Anyone who can reach the UI or API can read and change
  all data. Documented in the README and setup guide.
- User markdown is rendered with `rehype-sanitize`; script/`onerror` payloads
  stay inert.

[0.1.0]: https://github.com/shanecookofficial/open-tc-manager/releases/tag/v0.1.0
