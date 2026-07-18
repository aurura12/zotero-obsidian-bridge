VERSION ?= $(shell node -p "require('./plugins/obsidian/manifest.json').version")
GITHUB_REPO ?= KeiYuHin/zotero-obsidian-bridge
ZOTERO_UPDATE_URL ?= https://github.com/$(GITHUB_REPO)/releases/latest/download/zotero-updates.json
ZOTERO_UPDATE_LINK ?= https://github.com/$(GITHUB_REPO)/releases/download/$(VERSION)/zotero-citekey-bridge-$(VERSION).xpi

.PHONY: release package version clean

release:
	node scripts/release.mjs --version $(VERSION) --zotero-update-url "$(ZOTERO_UPDATE_URL)" --zotero-update-link "$(ZOTERO_UPDATE_LINK)"

package: release

version:
	node scripts/release.mjs --version $(VERSION) --zotero-update-url "$(ZOTERO_UPDATE_URL)" --zotero-update-link "$(ZOTERO_UPDATE_LINK)" --no-package

clean:
	node scripts/release.mjs --clean
