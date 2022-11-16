/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODOs:
// - Search for registered debuggers and display warning if none are found? (Still launch debug view?)

interface TabState {
	tabId?: number;
	isDebuggerVisible?: boolean;
}

function getStateKey(tabId: number): string {
	return `fluid-client-debugger-tab-${tabId}-state`;
}

async function getTabState(tabId: number): Promise<TabState> {
	const stateKey = getStateKey(tabId);
	const storageData = await chrome.storage.local.get(stateKey);
	return storageData[stateKey] as TabState;
}

async function updateTabState(tabId: number, newState: TabState): Promise<void> {
	const stateKey = getStateKey(tabId);
	await chrome.storage.local.set({ [stateKey]: newState });
}

async function toggleDebuggerView(tabId: number): Promise<void> {
	const tabState = await getTabState(tabId);
	const visible: boolean = tabState?.isDebuggerVisible ?? false;

	const scriptToInvoke = visible ? "CloseDebuggerView.js" : "OpenDebuggerView.js";

	await chrome.scripting.executeScript({
		target: { tabId },
		files: [scriptToInvoke],
	});

	await updateTabState(tabId, {
		tabId,
		isDebuggerVisible: !visible,
	});
}

/**
 * When the extension icon is clicked, launch the debug view.
 */
chrome.action.onClicked.addListener((tab) => {
	toggleDebuggerView(tab.id ?? -1).catch((error) => {
		console.error(error);
	});
});

async function onStorageChange(changes: {
	[key: string]: chrome.storage.StorageChange;
}): Promise<void> {
	// Update icon background to reflect whether or not the debugger is visible.
	for (const [_, change] of Object.entries(changes)) {
		const tabState = change.newValue as TabState;
		if (tabState !== undefined) {
			const tabId = tabState.tabId;
			if (tabId !== undefined) {
				const visible = tabState.isDebuggerVisible ?? false;
				if (visible) {
					await chrome.action.setTitle({
						tabId,
						title: "Fluid Client debugger.\nClick to close.",
					});
					await chrome.action.setBadgeText({ tabId, text: "On" });
				} else {
					await chrome.action.setTitle({
						tabId,
						title: "Fluid Client debugger.\nClick to open.",
					});
					await chrome.action.setBadgeText({ tabId, text: "" });
				}
			}
		}
	}
}

chrome.storage.local.onChanged.addListener((changes) => {
	onStorageChange(changes).catch((error) => {
		console.error(error);
	});
});
