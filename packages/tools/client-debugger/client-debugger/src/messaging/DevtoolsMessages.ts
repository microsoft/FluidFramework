/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerMetadata } from "../ContainerMetadata";
import { IDebuggerMessage } from "./Messages";

// #region Inbound messages

/**
 * {@link GetContainerListMessage} {@link IDebuggerMessage."type"}.
 *
 * @public
 */
export const GetContainerListMessageType = "GET_CONTAINER_LIST";

/**
 * Inbound message requesting the list of Container IDs for which Devtools have been registered.
 * Will result in the {@link ContainerListMessage} message being posted.
 *
 * @public
 */
export interface GetContainerListMessage extends IDebuggerMessage<undefined> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: typeof GetContainerListMessageType;
}

// #endregion

// #region Outbound messages

/**
 * {@link ContainerListMessage} {@link IDebuggerMessage."type"}.
 *
 * @public
 */
export const ContainerListMessageType = "CONTAINER_LIST";

/**
 * Message data format used by {@link ContainerListMessage}.
 *
 * @public
 */
export interface ContainerListMessageData {
	/**
	 * Metadata list of Containers with active Client Debugger sessions registered.
	 */
	containers: ContainerMetadata[];
}

/**
 * Outbound message containing the list of Container-level devtools instances tracked by the root Devtools.
 *
 * Includes the new list of active Container IDs associated with active Container Devtools instances.
 *
 * @public
 */
export interface ContainerListMessage extends IDebuggerMessage<ContainerListMessageData> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: typeof ContainerListMessageType;
}

// #endregion
