/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { renderClientDebuggerView } from "@fluid-tools/client-debug-view";

import { isDebuggerPanelOpen } from "./Utilities";

/**
 * Appends the debugger view panel to the document (as a child under `body`).
 *
 * @returns Whether or not a new debugger view was appended to the document.
 *
 * @internal
 */
export async function openDebuggerPanel(): Promise<boolean> {
	if (isDebuggerPanelOpen()) {
		return false;
	}

	return renderClientDebuggerView(document.body);
}
