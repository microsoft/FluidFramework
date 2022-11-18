/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { openDebuggerScriptId } from "./Constants";

/**
 * Injects `CloseDebuggerPanelScript` into the page to close the debugger panel on the page (if it
 * exists).
 *
 * @remarks This module is run as a {@link https://developer.chrome.com/docs/extensions/mv3/content_scripts | Content Script}.
 */
async function injectDebuggerCloseScript(): Promise<void> {
	// Append script that closes the debugger panel
	const enableDebugViewScript = document.createElement("script");
	enableDebugViewScript.src = chrome.runtime.getURL("CloseDebuggerPanelScript.js");
	enableDebugViewScript.id = openDebuggerScriptId;
	(document.head ?? document.documentElement).append(enableDebugViewScript);

	// Remove script; it only needs to perform cleanup once.
	enableDebugViewScript.remove();
}

injectDebuggerCloseScript().catch((error) => {
	console.error(error);
	throw error;
});
