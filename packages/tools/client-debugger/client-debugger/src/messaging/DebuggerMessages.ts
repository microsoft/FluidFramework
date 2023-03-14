/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISummaryTree } from "@fluidframework/protocol-definitions";
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
 * Message data format used by {@link GetContainerStateMessage}.
 *
 * @public
 */
export type GetContainerStateMessageData = HasContainerId;

/**
 * Inbound event requesting the {@link ContainerStateMetadata} of the Container with the specified ID.
 * Will result in the {@link ContainerStateChangeMessage} message being posted.
 *
 * @public
 */
export interface GetContainerStateMessage extends IDebuggerMessage<GetContainerStateMessageData> {
	type: "GET_CONTAINER_STATE";
}

/**
 * Message data format used by {@link GetContainerStateMessage}.
 *
 * @public
 */
export type GetContainerDataMessageData = HasContainerId;

/**
 * Inbound event requesting a complete summary of the specified Container's data.
 * Will result in the {@link ContainerDataSummaryMessage} message being posted.
 *
 * @public
 */
export interface GetContainerDataMessage extends IDebuggerMessage<GetContainerDataMessageData> {
	type: "GET_CONTAINER_DATA";
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
	extends IDebuggerMessage<ContainerStateChangeMessageData> {
	type: "CONTAINER_STATE_CHANGE";
}

/**
 * Message data format used by {@link ContainerDataSummaryMessage}.
 *
 * @public
 */
export interface ContainerDataSummaryMessageData extends HasContainerId {
	/**
	 * Complete summary of the Container's data.
	 */
	summary: ISummaryTree;
}

/**
 * Outbound event containing a complete summary of the Container's data.
 *
 * @public
 */
export interface ContainerDataSummaryMessage
	extends IDebuggerMessage<ContainerDataSummaryMessageData> {
	type: "CONTAINER_DATA_SUMMARY";
}

// #endregion
