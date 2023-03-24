/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerStateMetadata } from "../ContainerMetadata";
import { FluidHandleNode, FluidObjectId, FluidObjectNode } from "../data-visualization";
import { ConnectionStateChangeLogEntry } from "../Logs";
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

/**
 * Base interface used in message data for events targeting a particular Fluid object (DDS) via
 * a unique ID.
 *
 * @public
 */
export interface HasFluidObjectId {
	/**
	 * The ID of the Fluid object (DDS) whose data is being requested.
	 */
	fluidObjectId: FluidObjectId;
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
 * Message data format used by {@link GetRootDataMessage}.
 *
 * @public
 */
export type GetRootDataMessageData = HasContainerId;

/**
 * Message data format used by {@link GetFluidDataMessage}.
 *
 * @public
 */
export type GetFluidDataMessageData = HasContainerId & HasFluidObjectId;

/**
 * Inbound event requesting the {@link ContainerStateMetadata} of the Container with the specified ID.
 * Will result in the {@link ContainerStateChangeMessage} message being posted.
 *
 * @public
 */
export interface GetContainerStateMessage extends IDebuggerMessage<HasContainerId> {
	type: "GET_CONTAINER_STATE";
}

/**
 * Inbound event requesting the root DDS data tracked by the debugger associated with the specified Container ID.
 * Will result in the {@link RootDataMessage} message being posted.
 *
 * @public
 */
export interface GetRootDataMessage extends IDebuggerMessage<GetRootDataMessageData> {
	type: "GET_ROOT_DATA";
}

/**
 * Inbound event requesting the root DDS data tracked by the debugger associated with the specified Container ID.
 * Will result in the {@link RootDataMessage} message being posted.
 *
 * @public
 */
export interface GetFluidDataMessage extends IDebuggerMessage<GetFluidDataMessageData> {
	type: "GET_FLUID_DATA";
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
 * Message data format used by {@link RootDataMessage}.
 *
 * @public
 */
export interface RootDataMessageData extends HasContainerId {
	/**
	 * List of root Fluid objects.
	 */
	handles: FluidHandleNode[];
}

/**
 * Message data format used by {@link FluidDataMessage}.
 *
 * @public
 */
export interface FluidDataMessageData extends HasContainerId, HasFluidObjectId {
	/**
	 * A visual description tree for a particular DDS.
	 *
	 * Will be undefined only if the debugger has no data associated with the provided
	 * {@link HasFluidObjectId.fluidObjectId | ID}.
	 */
	visualTree: FluidObjectNode | undefined;
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
 * Inbound event indicating Container connected.
 *
 * @public
 */
export interface ConnectContainerMessage extends IDebuggerMessage<ConnectContainerMessageData> {
	type: "CONNECT_CONTAINER";
}

/**
 * Inbound event indicating Container disconnected.
 *
 * @public
 */
export interface DisconnectContainerMessage
	extends IDebuggerMessage<DisconnectContainerMessageData> {
	type: "DISCONNECT_CONTAINER";
}

/**
 * Inbound event indicating Container closed.
 *
 * @public
 */
export interface CloseContainerMessage extends IDebuggerMessage<CloseContainerMessageData> {
	type: "CLOSE_CONTAINER";
}

/**
 * Outbound event containing the associated Container's state history.
 *
 * @public
 */
export interface ContainerStateHistoryMessage
	extends IDebuggerMessage<ContainerStateHistoryMessageData> {
	type: "CONTAINER_STATE_HISTORY";
}

/**
 * Outbound event indicating Container state history.
 *
 * @public
 */
export interface RootDataMessage extends IDebuggerMessage<RootDataMessageData> {
	type: "ROOT_DATA";
}

/**
 * Outbound event indicating Container state history.
 *
 * @public
 */
export interface FluidDataMessage extends IDebuggerMessage<FluidDataMessageData> {
	type: "FLUID_DATA_VISUALIZATION";
}

// #endregion
