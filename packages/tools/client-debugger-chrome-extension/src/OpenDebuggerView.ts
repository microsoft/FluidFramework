/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { closeDebuggerScriptId, openDebuggerScriptId } from "./Constants";

/**
 * Toggles the debugger UI. If not currently displayed, will open it. Otherwise, will close it.
 *
 * @returns Whether or not the extension is now displayed.
 */
async function appendOpenDebuggerScript(): Promise<void> {
	// Clean up panel-closing script, if it is on the page.

	// eslint-disable-next-line unicorn/prefer-query-selector
	const closeDebuggerPanelScript = document.getElementById(closeDebuggerScriptId);
	if (closeDebuggerPanelScript === null) {
		console.log("No debugger closing script found to remove.");
	} else {
		console.log("Removing debugger-closing script...");
		closeDebuggerPanelScript.remove();
		console.log("Script removed.");
	}

	// Append panel opening script to the page.
	const enableDebugViewScript = document.createElement("script");
	enableDebugViewScript.src = chrome.runtime.getURL("OpenDebuggerPanelScript.js");
	enableDebugViewScript.id = openDebuggerScriptId;
	(document.head ?? document.documentElement).append(enableDebugViewScript);

	// TODO: do we remove the script? Or leave it?
}

appendOpenDebuggerScript().catch((error) => {
	console.error(error);
	throw error;
});
