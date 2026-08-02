var ZoteroObsidianCitekeyLink = {
	TITLE: 'Zotero Citekey Bridge',
	MENU_PREFIX: 'zotero-obsidian-citekey-link',
	windows: new Map(),

	config: Object.freeze({
		vaultName: '论文',
		folder: 'maic',
		extraLabel: 'Obsidian Link',
		createBaseURL: 'obsidian://zotero-note',
		openBaseURL: 'obsidian://zotero-open-note',
	}),

	// Read config from Zotero preferences, falling back to the defaults above.
	// Use the "global" flag so Zotero.Prefs does not prepend "extensions.zotero."
	getConfigValue(name) {
		try {
			const value = Zotero.Prefs.get(
				`extensions.zotero-citekey-bridge.${name}`,
				true
			);
			if (value !== undefined && value !== null && value !== '') {
				return value;
			}
		}
		catch (error) {
			Zotero.debug(
				`Zotero Citekey Bridge: failed to read pref ${name}`
			);
		}
		return this.config[name];
	},

	init({ id, version, rootURI }) {
		this.id = id;
		this.version = version;
		this.rootURI = rootURI;
	},

	addToAllWindows() {
		for (const win of Zotero.getMainWindows()) {
			if (win?.ZoteroPane) {
				this.addToWindow(win);
			}
		}
	},

	removeFromAllWindows() {
		for (const win of [...this.windows.keys()]) {
			this.removeFromWindow(win);
		}
	},

	addToWindow(win) {
		if (!win?.document || this.windows.has(win)) {
			return;
		}

		const doc = win.document;
		const popup = doc.getElementById('zotero-itemmenu');
		if (!popup) {
			Zotero.debug('Zotero Citekey Bridge: #zotero-itemmenu not found');
			return;
		}

		// Idempotency guard: remove any leftover plugin menu items (e.g. from
		// a stale plugin instance after remove+reinstall) so duplicates cannot
		// accumulate even if the reference-based windows map check fails.
		for (const element of popup.querySelectorAll(
			`#${this.MENU_PREFIX}-separator, #${this.MENU_PREFIX}-create, ` +
			`#${this.MENU_PREFIX}-delete, #${this.MENU_PREFIX}-open`
		)) {
			element.remove();
		}

		const createXULElement = (tagName) => {
			if (typeof doc.createXULElement === 'function') {
				return doc.createXULElement(tagName);
			}
			return doc.createElement(tagName);
		};

		const separator = createXULElement('menuseparator');
		separator.id = `${this.MENU_PREFIX}-separator`;

		const createItem = this.makeMenuItem(
			win,
			`${this.MENU_PREFIX}-create`,
			'创建并关联 Obsidian 笔记',
			() => this.createAndLink(win),
		);

		const deleteItem = this.makeMenuItem(
			win,
			`${this.MENU_PREFIX}-delete`,
			'调试：删除 Obsidian 跳转链接',
			() => this.deleteStoredLink(win),
		);

		const openItem = this.makeMenuItem(
			win,
			`${this.MENU_PREFIX}-open`,
			'打开 Obsidian 笔记',
			() => this.openStoredLink(win),
		);

		popup.append(separator, createItem, deleteItem, openItem);

		const onPopupShowing = () => {
			const item = this.getSelectedRegularItem(win);
			const enabled = Boolean(item);
			for (const element of [createItem, deleteItem, openItem]) {
				if (enabled) {
					element.removeAttribute('disabled');
				} else {
					element.setAttribute('disabled', 'true');
				}
			}
		};

		popup.addEventListener('popupshowing', onPopupShowing);
		this.windows.set(win, {
			popup,
			onPopupShowing,
			elements: [separator, createItem, deleteItem, openItem],
		});
	},

	removeFromWindow(win) {
		const state = this.windows.get(win);
		if (!state) {
			return;
		}

		state.popup?.removeEventListener('popupshowing', state.onPopupShowing);

		for (const element of state.elements) {
			element?.remove();
		}

		this.windows.delete(win);
	},

	makeMenuItem(win, id, label, callback) {
		const doc = win.document;
		const menuItem =
			typeof doc.createXULElement === 'function'
				? doc.createXULElement('menuitem')
				: doc.createElement('menuitem');

		menuItem.id = id;
		menuItem.setAttribute('label', label);
		menuItem.addEventListener('command', () => {
			Promise.resolve(callback()).catch((error) => {
				this.handleError(win, label, error);
			});
		});

		return menuItem;
	},

	getSelectedRegularItem(win) {
		const items = win?.ZoteroPane?.getSelectedItems?.() || [];
		if (items.length !== 1) {
			return null;
		}

		const item = items[0];
		if (!item?.isRegularItem?.()) {
			return null;
		}

		return item;
	},

	requireSelectedRegularItem(win) {
		const item = this.getSelectedRegularItem(win);
		if (!item) {
			this.alert(
				win,
				'请只选择一条普通文献条目后再执行。附件、笔记和多选状态不支持。',
			);
		}
		return item;
	},

	async createAndLink(win) {
		const item = this.requireSelectedRegularItem(win);
		if (!item) {
			return;
		}

		const existingLink = this.getStoredLink(item);
		if (existingLink) {
			this.alert(
				win,
				'该条目已经保存了 Obsidian 跳转链接，已停止重复创建。\n\n' +
					'如果 Obsidian 中的笔记已被删除或重命名，无需删除此链接：' +
					'请直接使用“打开 Obsidian 笔记”，Obsidian 会提示是否一键重建。\n\n' +
					'如需彻底移除该关联，才需执行“调试：删除 Obsidian 跳转链接”。',
			);
			return;
		}

		const citekey = await this.getCitationKey(item);
		if (!citekey) {
			this.alert(
				win,
				'未找到 citation key。\n\n' +
					'请确认 Better BibTeX 已启用，并已为该条目生成 citation key。',
			);
			return;
		}

		const createURL = this.buildCreateURL(citekey);
		const openURL = this.buildOpenURL(citekey);

		// Directly invoke the OS-registered Obsidian protocol handler instead of
		// sending the URI through Zotero's generic external-link flow.
		// If this call throws, do not write the marker/link.
		this.launchObsidianURL(createURL);

		await this.setStoredLink(item, openURL);

		this.notify(`已创建并关联 Obsidian 笔记\n${citekey}`, 3500);
	},

	async deleteStoredLink(win) {
		const item = this.requireSelectedRegularItem(win);
		if (!item) {
			return;
		}

		const extra = String(item.getField('extra') || '');
		const updated = this.removeLinkLines(extra);

		if (updated === extra) {
			this.alert(win, '该条目没有保存 Obsidian 跳转链接。');
			return;
		}

		const confirmed = Services.prompt.confirm(
			win,
			this.TITLE,
			'确定删除该条目保存的 Obsidian 跳转链接吗？\n\n' +
				'删除后，可再次执行创建操作重新生成关联。',
		);
		if (!confirmed) {
			return;
		}

		item.setField('extra', updated);
		await item.saveTx();

		this.alert(win, '已删除该条目保存的 Obsidian 跳转链接。');
	},

	async openStoredLink(win) {
		const item = this.requireSelectedRegularItem(win);
		if (!item) {
			return;
		}

		const link = this.getStoredLink(item);
		if (!link) {
			this.alert(
				win,
				'该条目尚未保存 Obsidian 跳转链接。\n\n' +
					'请先执行“创建并关联 Obsidian 笔记”。',
			);
			return;
		}

		// 不直接使用存储链接（可能因笔记被移动而过期），而是走动态解析：
		// Obsidian 端按 citekey 反查笔记实际路径、打开并回写新路径，
		// 保证移动后仍能打开且 Extra 链接自动修复。
		const citekey = await this.getCitationKey(item);
		if (!citekey) {
			this.alert(
				win,
				'未找到 citation key。\n\n' +
					'请确认 Better BibTeX 已启用，并已为该条目生成 citation key。',
			);
			return;
		}

		this.launchObsidianURL(this.buildDynamicOpenURL(citekey));
	},

	launchObsidianURL(url) {
		Zotero.debug(`Zotero Citekey Bridge: Launching: ${url}`);
		const schemeMatch = String(url || '').match(/^([a-z][a-z0-9+.-]+):/i);
		const scheme = schemeMatch?.[1]?.toLowerCase();
		if (scheme !== 'obsidian') {
			throw new Error(`不允许打开非 Obsidian 协议：${scheme || '未知'}`);
		}

		const service = Components.classes[
			'@mozilla.org/uriloader/external-protocol-service;1'
		].getService(Components.interfaces.nsIExternalProtocolService);

		const found = {};
		const handlerInfo = service.getProtocolHandlerInfoFromOS(scheme, found);
		if (!found.value) {
			throw new Error(
				'系统中未找到 Obsidian 协议处理器，请确认 Obsidian 已正确安装。',
			);
		}

		handlerInfo.preferredAction =
			Components.interfaces.nsIHandlerInfo.useSystemDefault;
		handlerInfo.alwaysAskBeforeHandling = false;

		if (!Zotero.isWin) {
			Zotero.Utilities.Internal.Environment.clearMozillaVariables();
		}

		const uri = Services.io.newURI(url, null, null);
		if (typeof handlerInfo.launchWithURI === 'function') {
			handlerInfo.launchWithURI(uri, null);
			return;
		}

		// Compatibility fallback for platforms where launchWithURI is unavailable.
		Services.prefs.setBoolPref(
			`network.protocol-handler.warn-external.${scheme}`,
			false,
		);
		Services.prefs.setBoolPref(
			`network.protocol-handler.external.${scheme}`,
			true,
		);
		service.loadURI(uri, Services.scriptSecurityManager.getSystemPrincipal());
	},

	notify(message, timeout = 3500) {
		try {
			const progressWindow = new Zotero.ProgressWindow({
				closeOnClick: false,
			});
			progressWindow.changeHeadline(this.TITLE);
			progressWindow.addDescription(String(message));
			progressWindow.show();
			progressWindow.startCloseTimer(timeout);
		} catch (error) {
			Zotero.logError(error);
		}
	},

	async getCitationKey(item) {
		// Zotero 8/9: citation key is a native item field.
		try {
			const nativeKey = this.cleanCitationKey(item.getField('citationKey'));
			if (nativeKey) {
				return nativeKey;
			}
		} catch (error) {
			// Zotero 7 does not expose this native field.
		}

		// Zotero 7 and Better BibTeX-compatible fallback.
		try {
			const bbt = Zotero.BetterBibTeX;
			if (bbt?.ready && typeof bbt.ready.then === 'function') {
				await bbt.ready;
			}

			const record = bbt?.KeyManager?.get?.(item.id);
			const bbtKey = this.cleanCitationKey(
				record?.citationKey || record?.citekey,
			);
			if (bbtKey) {
				return bbtKey;
			}
		} catch (error) {
			Zotero.debug('Zotero Citekey Bridge: Better BibTeX key lookup failed');
			Zotero.logError(error);
		}

		// Compatibility fallback for libraries that retain keys in Extra.
		const extra = String(item.getField('extra') || '');
		const match = extra.match(
			/^\s*(?:Citation Key|citation-key|citationKey)\s*:\s*(.+?)\s*$/im,
		);
		return this.cleanCitationKey(match?.[1]);
	},

	cleanCitationKey(value) {
		return String(value || '')
			.trim()
			.replace(/^@/, '');
	},

	buildCreateURL(citekey) {
		return (
			`${this.getConfigValue('createBaseURL')}?citekey=` +
			encodeURIComponent(citekey)
		);
	},

	buildOpenURL(citekey) {
		const file = `${this.getConfigValue('folder')}/${citekey}`;
		return (
			'obsidian://open?vault=' +
			encodeURIComponent(this.getConfigValue('vaultName')) +
			'&file=' +
			encodeURIComponent(file) +
			'&paneType=tab'
		);
	},

	buildDynamicOpenURL(citekey) {
		const query = [
			'citekey=' + encodeURIComponent(citekey),
			'vault=' + encodeURIComponent(this.getConfigValue('vaultName')),
			'folder=' + encodeURIComponent(this.getConfigValue('folder')),
			'zport=' + encodeURIComponent(this.getHttpServerPort()),
		].join('&');
		return `${this.getConfigValue('openBaseURL')}?${query}`;
	},

	getHttpServerPort() {
		try {
			const port = Number(
				Zotero.Prefs.get('extensions.zotero.httpServer.port', true),
			);
			if (Number.isInteger(port) && port > 0) {
				return port;
			}
		} catch (error) {
			Zotero.debug(
				'Zotero Citekey Bridge: failed to read HTTP server port',
			);
		}
		return 23119;
	},

	registerHTTPEndpoint() {
		try {
			if (!Zotero.Server?.Endpoints) {
				Zotero.debug(
					'Zotero Citekey Bridge: Zotero.Server.Endpoints unavailable',
				);
				return;
			}
			Zotero.Server.Endpoints['/zotero-citekey-bridge/update-link'] =
				this.buildUpdateLinkEndpoint();
			Zotero.debug('Zotero Citekey Bridge: HTTP endpoint registered');
		} catch (error) {
			Zotero.logError(error);
		}
	},

	unregisterHTTPEndpoint() {
		try {
			if (Zotero.Server?.Endpoints) {
				delete Zotero.Server.Endpoints[
					'/zotero-citekey-bridge/update-link'
				];
			}
		} catch (error) {
			Zotero.logError(error);
		}
	},

	buildUpdateLinkEndpoint() {
		const bridge = this;

		function updateLinkEndpoint() {}

		updateLinkEndpoint.prototype.supportedMethods = ['POST'];
		updateLinkEndpoint.prototype.supportedDataTypes = ['application/json'];
		updateLinkEndpoint.prototype.permitBookmarklet = false;
		updateLinkEndpoint.prototype.init = async function (request) {
			return bridge.handleUpdateLinkRequest(request);
		};

		return updateLinkEndpoint;
	},

	async handleUpdateLinkRequest(request) {
		const body = request.data || {};
		const token = body.token || request.headers?.['x-citekey-bridge-token'] || '';

		if (!this.checkWritebackToken(token)) {
			return [
				403,
				'application/json',
				JSON.stringify({ ok: false, error: 'invalid token' }),
			];
		}

		const citekey = this.cleanCitationKey(body.citekey);
		const filePath = String(body.filePath || '').trim();
		const vaultName = String(body.vaultName || '').trim();

		if (!citekey || !filePath) {
			return [
				400,
				'application/json',
				JSON.stringify({
					ok: false,
					error: 'missing citekey or filePath',
				}),
			];
		}

		try {
			const item = await this.findItemByCitekey(citekey);
			if (!item) {
				return [
					404,
					'application/json',
					JSON.stringify({ ok: false, error: 'item not found' }),
				];
			}

			await this.updateStoredLink(item, filePath, vaultName);
			return [200, 'application/json', JSON.stringify({ ok: true })];
		} catch (error) {
			Zotero.logError(error);
			return [
				500,
				'application/json',
				JSON.stringify({
					ok: false,
					error: String(error?.message || error),
				}),
			];
		}
	},

	checkWritebackToken(token) {
		const expected = String(this.getConfigValue('writebackToken') || '').trim();
		return !expected || String(token || '').trim() === expected;
	},

	async findItemByCitekey(citekey) {
		const key = this.cleanCitationKey(citekey);
		if (!key) {
			return null;
		}

		// 1) Better BibTeX KeyManager 反向查找（其公开 API 是正向 get(itemID)，
		//    这里用 all() 取全部记录后按 citationKey 匹配）。
		try {
			const bbt = Zotero.BetterBibTeX;
			if (bbt?.ready && typeof bbt.ready.then === 'function') {
				await bbt.ready;
			}

			const all = bbt?.KeyManager?.all?.();
			if (all) {
				const records =
					all instanceof Map ? [...all.values()] : Object.values(all);
				for (const record of records) {
					const recordKey = this.cleanCitationKey(
						record?.citationKey || record?.citekey,
					);
					if (recordKey === key) {
						const item = Zotero.Items.get(record.itemID);
						if (item) {
							return item;
						}
					}
				}
			}
		} catch (error) {
			Zotero.debug(
				'Zotero Citekey Bridge: BBT KeyManager reverse lookup failed',
			);
		}

		// 2) 兜底：全库扫描（写回频率低，O(n) 可接受）。
		for (const item of Zotero.Items.getAll()) {
			if (!item.isRegularItem?.()) {
				continue;
			}
			const itemKey = await this.getCitationKey(item);
			if (itemKey === key) {
				return item;
			}
		}

		return null;
	},

	async updateStoredLink(item, filePath, vaultName) {
		const file = String(filePath || '').replace(/\.md$/i, '');
		const url =
			'obsidian://open?vault=' +
			encodeURIComponent(vaultName || this.getConfigValue('vaultName')) +
			'&file=' +
			encodeURIComponent(file) +
			'&paneType=tab';

		// 幂等：与现有链接一致时跳过，避免无意义写入。
		const existing = this.getStoredLink(item);
		if (existing && existing === url) {
			return false;
		}

		await this.setStoredLink(item, url);
		return true;
	},

	getStoredLink(item) {
		const extra = String(item.getField('extra') || '');
		const escapedLabel = this.escapeRegExp(this.getConfigValue('extraLabel'));
		const match = extra.match(
			new RegExp(
				`^\\s*${escapedLabel}\\s*:\\s*(obsidian:\\/\\/open\\?[^\\r\\n]+?)\\s*$`,
				'mi',
			),
		);
		return match?.[1]?.trim() || '';
	},

	async setStoredLink(item, url) {
		const extra = String(item.getField('extra') || '');
		const cleaned = this.removeLinkLines(extra);
		const lines = cleaned ? cleaned.split('\n') : [];

		while (lines.length && !lines[lines.length - 1].trim()) {
			lines.pop();
		}

		lines.push(`${this.getConfigValue('extraLabel')}: ${url}`);
		item.setField('extra', lines.join('\n'));
		await item.saveTx();
	},

	removeLinkLines(extra) {
		const escapedLabel = this.escapeRegExp(this.getConfigValue('extraLabel'));
		const markerLine = new RegExp(
			`^\\s*${escapedLabel}\\s*:\\s*obsidian:\\/\\/open\\?[^\\r\\n]*\\s*$`,
			'i',
		);

		const lines = String(extra || '')
			.replace(/\r\n/g, '\n')
			.split('\n')
			.filter((line) => !markerLine.test(line));

		while (lines.length && !lines[lines.length - 1].trim()) {
			lines.pop();
		}

		return lines.join('\n');
	},

	escapeRegExp(value) {
		return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	},

	alert(win, message) {
		try {
			Services.prompt.alert(win, this.TITLE, String(message));
		} catch (error) {
			win.alert(`${this.TITLE}\n\n${message}`);
		}
	},

	handleError(win, action, error) {
		Zotero.debug(`Zotero Citekey Bridge: ${action} failed`);
		Zotero.logError(error);
		this.alert(win, `${action}失败：\n\n${error?.message || String(error)}`);
	},
};
