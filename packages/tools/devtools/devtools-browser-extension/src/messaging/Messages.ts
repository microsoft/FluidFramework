/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISourcedDevtoolsMessage } from "@fluidframework/devtools-core/internal";

/**
 * {@link DevToolsInitMessage} {@link @fluidframework/devtools-core#ISourcedDevtoolsMessage."type"}
 * @internal
 */
export const devToolsInitMessageType = "initialize-devtools";

/**
 * Message data format used by {@link DevToolsInitMessage}.
 * @internal
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
 * @internal
 */
export interface DevToolsInitMessage extends ISourcedDevtoolsMessage {
	type: typeof devToolsInitMessageType;
	data: DevToolsInitMessageData;
}

/**
 * {@link DevToolsInitAcknowledgement} {@link @fluidframework/devtools-core#ISourcedDevtoolsMessage."type"}
 * @internal
 */
export const devToolsInitAcknowledgementType = "acknowledge-initialize-devtools";

/**
 * Devtools initialization acknowledgement.
 *
 * Sent from the Background Script to the Devtools Script to acknowledge the received {@link DevToolsInitMessage} was processed.
 * @internal
 */
export interface DevToolsInitAcknowledgement extends ISourcedDevtoolsMessage {
	type: typeof devToolsInitAcknowledgementType;
	data: undefined;
}
