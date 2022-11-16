/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { debuggerPanelId, openDebuggerScriptId } from "./Constants";

async function closeDebuggerPanel(): Promise<void> {
	console.log("Closing debugger view...");

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

	// Clean up debugger panel view element, if it exists

	// eslint-disable-next-line unicorn/prefer-query-selector
	const debuggerPanelElement = document.getElementById(debuggerPanelId);
	if (debuggerPanelElement === null) {
		console.log("No debugger view found to close.");
	} else {
		debuggerPanelElement.remove();
		console.log("Debugger panel closed!");
	}
}

closeDebuggerPanel().catch((error) => {
	console.error(error);
	throw error;
});
