/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * State we store on a per-tab basis.
 *
 * Tracks whether or not the debugger panel is currently visible.
 *
 * @remarks
 *
 * All properties are optional, as Chromium will create default instances (rather than returning `undefined`, for
 * example) when calling `get` with an unregistered key.
 */
interface TabState {
	tabId: number;
	isDebuggerVisible: boolean;
}

/**
 * Gets the default {@link TabState}.
 *
 * @remarks Used when initializing tab state for the first time.
 */
function getDefaultTabState(tabId: number): TabState {
	return {
		tabId,
		isDebuggerVisible: false,
	};
}

/**
 * Gets the local storage state key for the specified `tabId`.
 *
 * @remarks This key is used to access storage state.
 */
function getStateKey(tabId: number): string {
	return `fluid-client-debugger-tab-${tabId}-state`;
}

/**
 * Get stored tab state, if any exists.
 */
async function getTabState(tabId: number): Promise<TabState> {
	const stateKey = getStateKey(tabId);
	const storageData = await chrome.storage.local.get(stateKey);
	return (storageData[stateKey] as TabState) ?? getDefaultTabState(tabId);
}

/**
 * Updates the tab state in the local storage.
 */
async function updateTabState(tabId: number, newState: TabState): Promise<void> {
	const stateKey = getStateKey(tabId);
	await chrome.storage.local.set({ [stateKey]: newState });
}

/**
 * Toggles the debug view (and updates corresponding local storage tab state).
 *
 * @internal
 */
export async function toggleDebuggerView(tabId: number): Promise<void> {
	const tabState = await getTabState(tabId);
	const visible: boolean = tabState.isDebuggerVisible;

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
 * Invoked when local storage state has changed.
 *
 * @remarks Used to update the extension icon, etc. based on current tab state.
 *
 * @internal
 */
export async function onStorageChange(changes: {
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
					await chrome.action.setBadgeText({ tabId, text: "" }); // Remove badge altogether
				}
			}
		}
	}
}
