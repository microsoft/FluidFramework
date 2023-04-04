/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerMetadata } from "../ContainerMetadata";
import { IDebuggerMessage } from "./Messages";

// #region Inbound messages

/**
 * Inbound event requesting the list of Container IDs for which Devtools have been registered.
 * Will result in the {@link ContainerListChangeMessage} message being posted.
 *
 * @public
 */
export interface GetContainerListMessage extends IDebuggerMessage<undefined> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: "GET_CONTAINER_LIST";
}

// #endregion

// #region Outbound messages

/**
 * Message data format used by {@link ContainerListChangeMessage}.
 *
 * @public
 */
export interface ContainerListChangeMessageData {
	/**
	 * Metadata list of Containers with active Client Debugger sessions registered.
	 */
	containers: ContainerMetadata[];
}

/**
 * Outbound event indicating that the list of Container Devtools tracked by the root Devtools object has changed.
 * Includes the new list of active Container IDs associated with active Container Devtools instances.
 *
 * @public
 */
export interface ContainerListChangeMessage
	extends IDebuggerMessage<ContainerListChangeMessageData> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: "CONTAINER_LIST_CHANGE";
}

// #endregion
