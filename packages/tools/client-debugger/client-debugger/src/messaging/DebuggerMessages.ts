/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerStateMetadata } from "../ContainerMetadata";
import { FluidHandleNode, FluidObjectId, FluidObjectNode } from "../data-visualization";
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
 * Message data format used by {@link GetRootDataVisualizationsMessage}.
 *
 * @public
 */
export type GetRootDataVisualizationsMessageData = HasContainerId;

/**
 * Message data format used by {@link GetDataVisualizationMessage}.
 *
 * @public
 */
export type GetDataVisualizationMessageData = HasContainerId & HasFluidObjectId;

/**
 * Inbound message requesting the {@link ContainerStateMetadata} of the Container with the specified ID.
 *
 * Will result in the {@link ContainerStateChangeMessage} message being posted.
 *
 * @public
 */
export interface GetContainerStateMessage extends ISourcedDebuggerMessage<HasContainerId> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: "GET_CONTAINER_STATE";
}

/**
 * Inbound message requesting visualizations for the root DDS data tracked by the
 * debugger associated with the specified Container ID.
 *
 * Will result in the {@link RootDataVisualizationsMessage} message being posted.
 *
 * @public
 */
export interface GetRootDataVisualizationsMessage
	extends ISourcedDebuggerMessage<GetRootDataVisualizationsMessageData> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: "GET_ROOT_DATA_VISUALIZATIONS";
}

/**
 * Inbound message requesting a visualization for a specific DDS via its associated {@link HasFluidObjectId.fluidObjectId}.
 *
 * Will result in the {@link DataVisualizationMessage} message being posted.
 *
 * @public
 */
export interface GetDataVisualizationMessage
	extends ISourcedDebuggerMessage<GetDataVisualizationMessageData> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: "GET_DATA_VISUALIZATION";
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
 * Message data format used by {@link RootDataVisualizationsMessage}.
 *
 * @public
 */
export interface RootDataVisualizationsMessageData extends HasContainerId {
	/**
	 * List of root Fluid objects.
	 *
	 * @remarks Will be `undefined` iff the debugger has no data registered for visualization.
	 */
	visualizations: FluidHandleNode[] | undefined;
}

/**
 * Message data format used by {@link DataVisualizationMessage}.
 *
 * @public
 */
export interface DataVisualizationMessageData extends HasContainerId, HasFluidObjectId {
	/**
	 * A visual description tree for a particular DDS.
	 *
	 * Will be undefined only if the debugger has no data associated with the provided
	 * {@link HasFluidObjectId.fluidObjectId | ID}.
	 */
	visualization: FluidObjectNode | undefined;
}

/**
 * Outbound message indicating a state change within a Container.
 *
 * @public
 */
export interface ContainerStateChangeMessage
	extends ISourcedDebuggerMessage<ContainerStateChangeMessageData> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: "CONTAINER_STATE_CHANGE";
}

/**
 * Inbound message indicating Container connected.
 *
 * @public
 */
export interface ConnectContainerMessage
	extends ISourcedDebuggerMessage<ConnectContainerMessageData> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: "CONNECT_CONTAINER";
}

/**
 * Inbound message indicating Container disconnected.
 *
 * @public
 */
export interface DisconnectContainerMessage
	extends ISourcedDebuggerMessage<DisconnectContainerMessageData> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: "DISCONNECT_CONTAINER";
}

/**
 * Inbound message indicating Container closed.
 *
 * @public
 */
export interface CloseContainerMessage extends ISourcedDebuggerMessage<CloseContainerMessageData> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: "CLOSE_CONTAINER";
}

/**
 * Outbound message containing the associated Container's state history.
 *
 * @public
 */
export interface ContainerStateHistoryMessage
	extends ISourcedDebuggerMessage<ContainerStateHistoryMessageData> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: "CONTAINER_STATE_HISTORY";
}

/**
 * Outbound message containing the visual descriptions of the root DDSs associated
 * with the debugger.
 *
 * @public
 */
export interface RootDataVisualizationsMessage
	extends ISourcedDebuggerMessage<RootDataVisualizationsMessageData> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: "ROOT_DATA_VISUALIZATIONS";
}

/**
 * Outbound message containing a visual description of the DDS associated with {@link HasFluidObjectId.fluidObjectId}.
 *
 * @public
 */
export interface DataVisualizationMessage
	extends ISourcedDebuggerMessage<DataVisualizationMessageData> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: "DATA_VISUALIZATION";
}

// #endregion
