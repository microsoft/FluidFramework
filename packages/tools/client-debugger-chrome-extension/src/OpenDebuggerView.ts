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
async function appendOpenDebuggerScript(): Promise<void> {
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
