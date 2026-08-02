var ZoteroObsidianCitekeyLink;

function log(message) {
	Zotero.debug("Zotero Citekey Bridge: " + message);
}

async function startup({ id, version, rootURI }) {
	log(`Starting ${version}`);

	await Promise.all([
		Zotero.initializationPromise,
		Zotero.unlockPromise,
		Zotero.uiReadyPromise
	]);

	Services.scriptloader.loadSubScript(
		rootURI + "obsidian-zotero-link.js"
	);

	ZoteroObsidianCitekeyLink.init({ id, version, rootURI });
	ZoteroObsidianCitekeyLink.addToAllWindows();
	ZoteroObsidianCitekeyLink.registerHTTPEndpoint();

	Zotero.PreferencePanes.register({
		pluginID: id,
		src: rootURI + "preferences.xhtml"
	});
}

function onMainWindowLoad({ window }) {
	ZoteroObsidianCitekeyLink?.addToWindow(window);
}

function onMainWindowUnload({ window }) {
	ZoteroObsidianCitekeyLink?.removeFromWindow(window);
}

function shutdown() {
	log("Shutting down");
	ZoteroObsidianCitekeyLink?.unregisterHTTPEndpoint();
	ZoteroObsidianCitekeyLink?.removeFromAllWindows();
	ZoteroObsidianCitekeyLink = undefined;
}

function install() {}

function uninstall() {}
