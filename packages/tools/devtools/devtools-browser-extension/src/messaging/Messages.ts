/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ISourcedDevtoolsMessage } from "@fluid-experimental/devtools-core";

/**
 * {@link DevToolsInitMessage} {@link @fluid-experimental/devtools-core#ISourcedDevtoolsMessage."type"}
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
export interface DevToolsInitMessage extends ISourcedDevtoolsMessage {
	type: typeof devToolsInitMessageType;
	data: DevToolsInitMessageData;
}

/**
 * {@link DevToolsInitAcknowledgement} {@link @fluid-experimental/devtools-core#ISourcedDevtoolsMessage."type"}
 */
export const devToolsInitAcknowledgementType = "acknowledge-initialize-devtools";

/**
 * Devtools initialization acknowledgement.
 *
 * Sent from the Background Script to the Devtools Script to acknowledge the received {@link DevToolsInitMessage} was processed.
 */
export interface DevToolsInitAcknowledgement extends ISourcedDevtoolsMessage {
	type: typeof devToolsInitAcknowledgementType;
	data: undefined;
}
