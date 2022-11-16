/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import ReactDOM from "react-dom";

import { getFluidClientDebuggers } from "@fluid-tools/client-debugger";

import { closeDebuggerScriptId, debuggerPanelId } from "./Constants";
import { DebuggerPanel } from "./DebuggerPanel";

async function openDebuggerPanel(): Promise<void> {
	console.log("Opening debugger view...");

	// Clean up debugger panel closing script, if it is on the page.

	// eslint-disable-next-line unicorn/prefer-query-selector
	const closeDebuggerPanelScript = document.getElementById(closeDebuggerScriptId);
	if (closeDebuggerPanelScript === null) {
		console.log("No debugger closing script found to remove.");
	} else {
		console.log("Removing debugger-closing script...");
		closeDebuggerPanelScript.remove();
		console.log("Script removed.");
	}

	// Open debugger view, if one does not already exist on the page.

	// eslint-disable-next-line unicorn/prefer-query-selector
	const debuggerPanelElement = document.getElementById(debuggerPanelId);
	if (debuggerPanelElement === null) {
		const element = document.createElement("div");
		element.id = debuggerPanelId;
		document.body.append(element);

		const clientDebuggers = getFluidClientDebuggers();

		// TODO: once multi-debugger component is available, just use that.
		let containerIdKLUDGE: string;
		if (clientDebuggers.length === 0) {
			console.log("No client debuggers found.");
			containerIdKLUDGE = "NO DEBUGGERS FOUND";
		} else {
			containerIdKLUDGE = clientDebuggers[0].containerId;
			console.log(
				`1 or more debuggers found. Launching viewer for container with ID "${containerIdKLUDGE}".`,
			);
		}

		ReactDOM.render(<DebuggerPanel containerId={containerIdKLUDGE} />, element);

		console.log("Debugger panel opened!");
	} else {
		console.log("A debugger view already exists. A new view will not be created.");
	}
}

openDebuggerPanel().catch((error) => {
	console.error(error);
	throw error;
});
