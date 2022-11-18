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
	// Append script that closes the debugger panel
	const enableDebugViewScript = document.createElement("script");
	enableDebugViewScript.src = chrome.runtime.getURL("CloseDebuggerPanelScript.js");
	enableDebugViewScript.id = openDebuggerScriptId;
	(document.head ?? document.documentElement).append(enableDebugViewScript);

	// Remove script; it only needs to perform cleanup once.
	enableDebugViewScript.remove();
}

appendCloseDebuggerScript().catch((error) => {
	console.error(error);
	throw error;
});
