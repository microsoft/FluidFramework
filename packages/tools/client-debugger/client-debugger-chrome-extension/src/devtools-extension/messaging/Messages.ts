/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDebuggerMessage } from "@fluid-tools/client-debugger";

/**
 * Message data format used by {@link DevToolsInitMessage}.
 */
export interface DevToolsInitMessageData {
	/**
	 * ID of the tab being inspected.
	 */
	tabId: number;
}

/**
 * Special message format used in Devtools initialization.
 *
 * The devtools panel sends this to the background service worker to notify it of the tab ID it is associated with.
 */
export interface DevToolsInitMessage extends IDebuggerMessage {
	type: "initializeDevtools";
	data: DevToolsInitMessageData;
}
