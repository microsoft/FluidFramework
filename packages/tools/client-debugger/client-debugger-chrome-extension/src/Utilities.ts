/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { debuggerPanelId } from "./Constants";

/**
 * Determines whether or not the debugger view panel element exists on the page.
 */
export function isDebuggerPanelOpen(): boolean {
	const debuggerPanelElement = document.querySelector(`#${debuggerPanelId}`);
	return debuggerPanelElement !== null;
}
