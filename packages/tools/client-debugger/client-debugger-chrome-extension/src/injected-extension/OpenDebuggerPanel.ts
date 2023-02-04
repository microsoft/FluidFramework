/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { renderClientDebuggerView } from "@fluid-tools/client-debugger-view";

import { debuggerPanelId } from "./Constants";
import { isDebuggerPanelOpen } from "./Utilities";

/**
 * Appends the debugger view panel to the document (as a child under `body`).
 *
 * @returns Whether or not a new debugger view was appended to the document.
 *
 * @internal
 */
export async function openDebuggerPanel(): Promise<void> {
	if (isDebuggerPanelOpen()) {
		console.error("Debugger panel is already open.");
		return;
	}

	const debugPanel = document.createElement("div");
	debugPanel.id = debuggerPanelId;
	document.body.append(debugPanel);

	return renderClientDebuggerView(debugPanel);
}
