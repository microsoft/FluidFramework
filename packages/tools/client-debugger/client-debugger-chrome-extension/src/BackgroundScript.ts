/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { onStorageChange, toggleDebuggerView } from "./Background";

/**
 * When the extension icon is clicked, launch the debug view.
 */
chrome.action.onClicked.addListener((tab) => {
	toggleDebuggerView(tab.id ?? -1).catch((error) => {
		console.error(error);
	});
});

/**
 * When local storage is updated, update any properties derived from local tab state used by the extension.
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
	if (areaName === "local") {
		onStorageChange(changes).catch((error) => {
			console.error(error);
		});
	}
});
