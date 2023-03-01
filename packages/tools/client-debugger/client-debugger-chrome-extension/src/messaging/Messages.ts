/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDebuggerMessage } from "@fluid-tools/client-debugger";

/**
 * {@link DevToolsInitMessage} {@link @fluid-tools/client-debugger#IDebuggerMessage."type"}
 */
export const devToolsInitMessageType = "initialize-devtools";

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
 * Sent from Devtools Script to the Background Script to establish connection with tab (Content Script).
 */
export interface DevToolsInitMessage extends IDebuggerMessage {
	type: typeof devToolsInitMessageType;
	data: DevToolsInitMessageData;
}

/**
 * {@link DevToolsInitAcknowledgement} {@link @fluid-tools/client-debugger#IDebuggerMessage."type"}
 */
export const devToolsInitAcknowledgementType = "acknowledge-initialize-devtools";

/**
 * Devtools initialization acknowledgement.
 *
 * Sent from the Background Script to the Devtools Script to acknowledge the received {@link DevToolsInitMessage} was processed.
 */
export interface DevToolsInitAcknowledgement extends IDebuggerMessage {
	type: typeof devToolsInitAcknowledgementType;
	data: undefined;
}

/**
 * Form of message response used in message passing using chrome.runtime, where
 * direct responses are supported.
 */
export interface MessageResponse {
	/**
	 * Whether or not the message was processed correctly.
	 * `false` likely indicates an error.
	 */
	success: boolean;
}
