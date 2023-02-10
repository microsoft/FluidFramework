/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerStateMetadata } from "../ContainerMetadata";
import { IDebuggerMessage } from "./Messages";

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
 * Inbound event requesting the debugger associated with the provided Container ID begin posting
 * change events to the window.
 *
 * @public
 */
export interface InitiateDebuggerMessagingMessage extends IDebuggerMessage<HasContainerId> {
	type: "INITIATE_DEBUGGER_MESSAGING";
}

/**
 * Inbound event requesting the debugger associated with the provided Container ID cease posting
 * change events to the window.
 *
 * @public
 */
export interface TerminateDebuggerMessagingMessage extends IDebuggerMessage<HasContainerId> {
	type: "TERMINATE_DEBUGGER_MESSAGING";
}

/**
 * Inbound event requesting the {@link ContainerStateMetadata} of the Container with the specified ID.
 * Will result in the {@link ContainerStateChangeMessage} message being posted.
 *
 * @public
 */
export interface GetContainerStateMessage extends IDebuggerMessage<HasContainerId> {
	type: "GET_CONTAINER_STATE";
}

// #endregion

// #region Outbound messages

/**
 * Message data format used by {@link ContainerStateChangeMessage}.
 *
 * @public
 */
export interface ContainerStateChangeMessageData {
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
	extends IDebuggerMessage<ContainerStateChangeMessageData> {
	type: "CONTAINER_STATE_CHANGE";
}

// #endregion
