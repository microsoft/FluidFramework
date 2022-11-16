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
