/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerStateMetadata } from "../ContainerMetadata";
import { FluidObjectId, FluidObjectNode, RootHandleNode } from "../data-visualization";
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
 * {@link GetContainerStateMessage} {@link IDebuggerMessage."type"}.
 *
 * @public
 */
export const GetContainerStateMessageType = "GET_CONTAINER_STATE";

/**
 * Message data format used by {@link GetContainerStateMessage}.
 *
 * @public
 */
export type GetContainerStateMessageData = HasContainerId;

/**
 * {@link ConnectContainerMessage} {@link IDebuggerMessage."type"}.
 *
 * @public
 */
export const ConnectContainerMessageType = "CONNECT_CONTAINER";

/**
 * Message data format used by {@link ConnectContainerMessage}.
 *
 * @public
 */
export type ConnectContainerMessageData = HasContainerId;

/**
 * {@link DisconnectContainerMessage} {@link IDebuggerMessage."type"}.
 *
 * @public
 */
export const DisconnectContainerMessageType = "DISCONNECT_CONTAINER";

/**
 * Message data format used by {@link DisconnectContainerMessage}.
 *
 * @public
 */
export type DisconnectContainerMessageData = HasContainerId;

/**
 * {@link CloseContainerMessage} {@link IDebuggerMessage."type"}.
 *
 * @public
 */
export const CloseContainerMessageType = "CLOSE_CONTAINER";

/**
 * Message data format used by {@link CloseContainerMessage}.
 *
 * @public
 */
export type CloseContainerMessageData = HasContainerId;

/**
 * {@link GetRootDataVisualizationsMessage} {@link IDebuggerMessage."type"}.
 *
 * @public
 */
export const GetRootDataVisualizationsMessageType = "GET_ROOT_DATA_VISUALIZATIONS";

/**
 * Message data format used by {@link GetRootDataVisualizationsMessage}.
 *
 * @public
 */
export type GetRootDataVisualizationsMessageData = HasContainerId;

/**
 * {@link GetDataVisualizationMessage} {@link IDebuggerMessage."type"}.
 *
 * @public
 */
export const GetDataVisualizationMessageType = "GET_DATA_VISUALIZATION";

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
export interface GetContainerStateMessage extends IDebuggerMessage<HasContainerId> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: typeof GetContainerStateMessageType;
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
	extends IDebuggerMessage<GetRootDataVisualizationsMessageData> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: typeof GetRootDataVisualizationsMessageType;
}

/**
 * Inbound message requesting a visualization for a specific DDS via its associated {@link HasFluidObjectId.fluidObjectId}.
 *
 * Will result in the {@link DataVisualizationMessage} message being posted.
 *
 * @public
 */
export interface GetDataVisualizationMessage
	extends IDebuggerMessage<GetDataVisualizationMessageData> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: typeof GetDataVisualizationMessageType;
}

// #endregion

// #region Outbound messages

/**
 * {@link ContainerStateChangeMessage} {@link IDebuggerMessage."type"}.
 *
 * @public
 */
export const ContainerStateChangeMessageType = "CONTAINER_STATE_CHANGE";

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
 * {@link ContainerStateHistoryMessage} {@link IDebuggerMessage."type"}.
 *
 * @public
 */
export const ContainerStateHistoryMessageType = "CONTAINER_STATE_HISTORY";

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
 * {@link RootDataVisualizationsMessage} {@link IDebuggerMessage."type"}.
 *
 * @public
 */
export const RootDataVisualizationsMessageType = "ROOT_DATA_VISUALIZATIONS";

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
	visualizations: Record<string, RootHandleNode> | undefined;
}

/**
 * {@link DataVisualizationMessage} {@link IDebuggerMessage."type"}.
 *
 * @public
 */
export const DataVisualizationMessageType = "DATA_VISUALIZATION";

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
	extends IDebuggerMessage<ContainerStateChangeMessageData> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: typeof ContainerStateChangeMessageType;
}

/**
 * Inbound message indicating Container connected.
 *
 * @public
 */
export interface ConnectContainerMessage extends IDebuggerMessage<ConnectContainerMessageData> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: typeof ConnectContainerMessageType;
}

/**
 * Inbound message indicating Container disconnected.
 *
 * @public
 */
export interface DisconnectContainerMessage
	extends IDebuggerMessage<DisconnectContainerMessageData> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: typeof DisconnectContainerMessageType;
}

/**
 * Inbound message indicating Container closed.
 *
 * @public
 */
export interface CloseContainerMessage extends IDebuggerMessage<CloseContainerMessageData> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: typeof CloseContainerMessageType;
}

/**
 * Outbound message containing the associated Container's state history.
 *
 * @public
 */
export interface ContainerStateHistoryMessage
	extends IDebuggerMessage<ContainerStateHistoryMessageData> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: typeof ContainerStateHistoryMessageType;
}

/**
 * Outbound message containing the visual descriptions of the root DDSs associated
 * with the debugger.
 *
 * @public
 */
export interface RootDataVisualizationsMessage
	extends IDebuggerMessage<RootDataVisualizationsMessageData> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: typeof RootDataVisualizationsMessageType;
}

/**
 * Outbound message containing a visual description of the DDS associated with {@link HasFluidObjectId.fluidObjectId}.
 *
 * @public
 */
export interface DataVisualizationMessage extends IDebuggerMessage<DataVisualizationMessageData> {
	/**
	 * {@inheritDoc IDebuggerMessage."type"}
	 */
	type: typeof DataVisualizationMessageType;
}

// #endregion
