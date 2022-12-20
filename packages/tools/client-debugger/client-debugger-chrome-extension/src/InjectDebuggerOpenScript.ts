/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { openDebuggerScriptId } from "./Constants";

/**
 * Injects `OpenDebuggerPanelScript` into the page to launch the debugger panel on the page (if it
 * does not exist).
 *
 * @remarks This module is run as a {@link https://developer.chrome.com/docs/extensions/mv3/content_scripts | Content Script}.
 */
async function injectDebuggerOpenScript(): Promise<void> {
	// Append panel opening script to the page.
	const enableDebugViewScript = document.createElement("script");
	enableDebugViewScript.src = chrome.runtime.getURL("OpenDebuggerPanelScript.js");
	enableDebugViewScript.id = openDebuggerScriptId;
	(document.head ?? document.documentElement).append(enableDebugViewScript);

	// Remove the script - we only need it to run once.
	// Note: refreshing the page will close the panel, but that's probably a reasonable policy.
	enableDebugViewScript.remove();
}

injectDebuggerOpenScript().catch((error) => {
	console.error(error);
	throw error;
});
