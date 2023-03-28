/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerStateMetadata } from "../ContainerMetadata";
import { ConnectionStateChangeLogEntry } from "../Logs";
import { ISourcedDebuggerMessage } from "./Messages";

/**
 * Base interface used in message data for events targeting a particular debugger instance via
 * its Container ID.
 *
 * @public
 */
export interface HasContainerId {
	/**
	 * The ID of the Container whose metadata is being requested.
	 */
	containerId: string;
}

// #region Inbound messages

/**
 * Message data format used by {@link GetContainerStateMessage}.
 *
 * @public
 */
export type GetContainerStateMessageData = HasContainerId;

/**
 * Message data format used by {@link ConnectContainerMessage}.
 *
 * @public
 */
export type ConnectContainerMessageData = HasContainerId;

/**
 * Message data format used by {@link DisconnectContainerMessage}.
 *
 * @public
 */
export type DisconnectContainerMessageData = HasContainerId;

/**
 * Message data format used by {@link CloseContainerMessage}.
 *
 * @public
 */
export type CloseContainerMessageData = HasContainerId;

/**
 * Message data format used by {@link ContainerStateHistoryMessage}.
 *
 * @public
 */
export interface ContainerStateHistoryMessageData extends HasContainerId {
	/**
	 * The Container's connection state history.
	 */
	history: ConnectionStateChangeLogEntry[];
}

/**
 * Inbound event requesting the {@link ContainerStateMetadata} of the Container with the specified ID.
 * Will result in the {@link ContainerStateChangeMessage} message being posted.
 *
 * @public
 */
export interface GetContainerStateMessage extends ISourcedDebuggerMessage<HasContainerId> {
	type: "GET_CONTAINER_STATE";
}

// #endregion

// #region Outbound messages

/**
 * Message data format used by {@link ContainerStateChangeMessage}.
 *
 * @public
 */
export interface ContainerStateChangeMessageData extends HasContainerId {
	/**
	 * Updated Container state metadata.
	 */
	containerState: ContainerStateMetadata;

	// TODO: change logs
}

/**
 * Outbound event indicating a state change within a Container.
 *
 * @public
 */
export interface ContainerStateChangeMessage
	extends ISourcedDebuggerMessage<ContainerStateChangeMessageData> {
	type: "CONTAINER_STATE_CHANGE";
}

/**
 * Inbound event indicating Container connected.
 *
 * @public
 */
export interface ConnectContainerMessage
	extends ISourcedDebuggerMessage<ConnectContainerMessageData> {
	type: "CONNECT_CONTAINER";
}

/**
 * Inbound event indicating Container disconnected.
 *
 * @public
 */
export interface DisconnectContainerMessage
	extends ISourcedDebuggerMessage<DisconnectContainerMessageData> {
	type: "DISCONNECT_CONTAINER";
}

/**
 * Inbound event indicating Container closed.
 *
 * @public
 */
export interface CloseContainerMessage extends ISourcedDebuggerMessage<CloseContainerMessageData> {
	type: "CLOSE_CONTAINER";
}

/**
 * Outbound event indicating Container state history.
 *
 * @public
 */
export interface ContainerStateHistoryMessage
	extends ISourcedDebuggerMessage<ContainerStateHistoryMessageData> {
	type: "CONTAINER_STATE_HISTORY";
}
// #endregion
