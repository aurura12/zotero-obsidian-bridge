# Zotero Obsidian Bridge

Paired personal plugins for a citekey-first Zotero to Obsidian literature-note workflow.

This repository contains two small plugins that are meant to be versioned and released together:

- **Zotero Citekey Bridge**: a Zotero 7+ plugin that reads a citation key, calls an Obsidian URL, and stores an `Obsidian Link:` back on the Zotero item.
- **Citekey Import Bridge**: an Obsidian desktop plugin that receives `obsidian://zotero-note?citekey=...` links and calls Zotero Integration's import flow.

中文说明见 [README.zh-CN.md](README.zh-CN.md).

## Requirements

- Zotero 7 or later.
- Better BibTeX for Zotero, unless your Zotero version exposes a native `citationKey` field.
- Obsidian desktop.
- Zotero Integration for Obsidian, plugin ID `obsidian-zotero-desktop-connector`.
- A Zotero Integration import format named `Paper Note`, or an explicit `format` query parameter in the URL.

## Workflow

1. In Zotero, right-click a regular item and choose `创建并关联 Obsidian 笔记`.
2. The Zotero plugin resolves the item citekey.
3. It opens `obsidian://zotero-note?citekey=<citekey>`.
4. The Obsidian plugin receives the citekey and calls Zotero Integration's `runImport(format, citekey, library)`.
5. The Zotero plugin stores an `Obsidian Link:` in the item's `Extra` field for later opening.

## Repository Layout

```text
plugins/
  zotero/      Zotero Citekey Bridge source
  obsidian/    Citekey Import Bridge source
docs/zh/       development notes and the Zotero Integration template
scripts/       release automation
release/       generated artifacts, ignored by git
```

## Release

With Make:

```sh
make release VERSION=0.1.0 GITHUB_REPO=YuxuanQi/zotero-obsidian-bridge
```

Without Make:

```sh
node scripts/release.mjs --version 0.1.0
```

The release command updates internal versions and writes:

- `release/<version>/zotero/zotero-citekey-bridge-<version>.xpi`
- `release/<version>/zotero/zotero-updates.json`
- `release/<version>/obsidian/main.js`
- `release/<version>/obsidian/manifest.json`
- `release/<version>/obsidian/versions.json`
- `release/<version>/obsidian/citekey-import-bridge-<version>.zip`

For an Obsidian GitHub release, upload `main.js`, `manifest.json`, and optionally `versions.json` or the zip for manual installs. For a Zotero release, upload the `.xpi` and `zotero-updates.json`.

## Notes

The Obsidian side intentionally keeps the plugin ID as `citekey-import-bridge`. Current Obsidian community-plugin submission rules require the `id` to avoid the word `obsidian`.

`Citekey Import Bridge` calls Zotero Integration's `runImport()` method. That method is useful and works well for this workflow, but it is not a formally stable public API, so future Zotero Integration updates may require a small compatibility change.

## License

MIT
