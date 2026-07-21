VERSION ?= $(shell node -p "require('./plugins/obsidian/manifest.json').version")
GITHUB_REPO ?= KeiYuHin/zotero-obsidian-bridge

.PHONY: release package version clean

release:
	node scripts/release.mjs --version $(VERSION) --github-repo $(GITHUB_REPO)

package: release

version:
	node scripts/release.mjs --version $(VERSION) --github-repo $(GITHUB_REPO) --no-package

clean:
	node scripts/release.mjs --clean
