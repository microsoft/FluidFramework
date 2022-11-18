/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import ReactDOM from "react-dom";

import { getFluidClientDebuggers } from "@fluid-tools/client-debugger";

import { debuggerPanelId } from "./Constants";
import { DebuggerPanel } from "./DebuggerPanel";
import { isDebuggerPanelOpen } from "./Utilities";

/**
 * Appends the debugger view panel to the document (as a child under `body`).
 * If a debugger view panel is already active, it does not append a new instance.
 *
 * @returns Whether or not a new debugger view was appended to the document.
 *
 * @internal
 */
export async function openDebuggerPanel(): Promise<boolean> {
	if (isDebuggerPanelOpen()) {
		return false;
	}

	const element = document.createElement("div");
	element.id = debuggerPanelId;
	document.body.append(element);

	const clientDebuggers = getFluidClientDebuggers();

	// TODO: once multi-debugger component is available, just use that.
	const containerIdKLUDGE =
		clientDebuggers.length === 0 ? "NO DEBUGGERS FOUND" : clientDebuggers[0].containerId;

	return new Promise<boolean>((resolve) => {
		try {
			ReactDOM.render(<DebuggerPanel containerId={containerIdKLUDGE} />, element, () => {
				resolve(true);
			});
		} catch (error) {
			console.error(`Could not open the debugger view due to an error: ${error}.`);
			return false;
		}
	});
}
