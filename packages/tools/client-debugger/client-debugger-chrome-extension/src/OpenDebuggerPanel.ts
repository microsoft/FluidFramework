/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { renderClientDebuggerView } from "@fluid-tools/client-debugger-view";

import { debuggerPanelId } from "./Constants";
import { isDebuggerPanelOpen } from "./Utilities";

/**
 * Appends the debugger view panel to the document (as a child under `body`) if the debugger panel is not already open.
 *
 * @internal
 */
export async function openDebuggerPanel(): Promise<void> {
	if (isDebuggerPanelOpen()) {
		console.warn("Debugger panel is already open.");
		return;
	}

	const debugPanel = document.createElement("div");
	debugPanel.id = debuggerPanelId;
	document.body.append(debugPanel);

	return renderClientDebuggerView(debugPanel);
}
