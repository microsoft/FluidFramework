/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { debuggerPanelId } from "./Constants";

/**
 * Searches for the debugger panel element on the page, and removes it if found.
 *
 * @returns Whether or not an element was found and removed.
 *
 * @internal
 */
export async function closeDebuggerPanel(): Promise<boolean> {
	const debuggerPanelElement = document.querySelector(`#${debuggerPanelId}`);
	if (debuggerPanelElement === null) {
		return false;
	} else {
		debuggerPanelElement.remove();
		return true;
	}
}
