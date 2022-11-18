/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { openDebuggerScriptId } from "./Constants";

/**
 * Toggles the debugger UI. If not currently displayed, will open it. Otherwise, will close it.
 *
 * @returns Whether or not the extension is now displayed.
 */
async function appendCloseDebuggerScript(): Promise<void> {
	// Clean up debugger panel opening script, if it is on the page.
	// eslint-disable-next-line unicorn/prefer-query-selector
	const openDebuggerPanelScript = document.getElementById(openDebuggerScriptId);
	if (openDebuggerPanelScript === null) {
		console.log("No debugger opening script found to remove.");
	} else {
		console.log("Removing debugger-opening script...");
		openDebuggerPanelScript.remove();
		console.log("Script removed.");
	}

	// Append script that closes the debugger panel

	const enableDebugViewScript = document.createElement("script");
	enableDebugViewScript.src = chrome.runtime.getURL("CloseDebuggerPanelScript.js");
	enableDebugViewScript.id = openDebuggerScriptId;
	(document.head ?? document.documentElement).append(enableDebugViewScript);

	// Remove script, as it only needs to perform cleanup once.
	// TODO?
	// enableDebugViewScript.remove();
}

appendCloseDebuggerScript().catch((error) => {
	console.error(error);
	throw error;
});
