/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerMetadata, ContainerStateMetadata } from "../ContainerMetadata";

// TODOs:
// - Pass diffs instead of all data in change events (probably requires defining separate full-dump messages from delta messages)

/**
 * Message structure expected for window event listeners used by the Fluid Client Debugger.
 *
 * @public
 */
export interface IDebuggerMessage {
	type?: string;
	data?: unknown;
}

/**
 * Message structure used in window messages *received* by the Fluid Client Debugger.
 *
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IInboundMessage extends IDebuggerMessage {}

/**
 * Message structure used in window messages *sent* by the Fluid Client Debugger.
 *
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IOutboundMessage extends IDebuggerMessage {}

/**
 * Inbound event requesting the list of Container IDs for which debuggers have been registered.
 * Will result in the {@link RegistryChangeMessage} message being posted.
 *
 * @privateRemarks TODO: do we want separate on-add / on-remove events (let subscribers manage their own lists)?
 *
 * @public
 */
export interface GetContainerListMessage extends IInboundMessage {
	type: "GET_CONTAINER_LIST";
	data: undefined;
}

/**
 * Inbound event requesting the {@link ContainerStateMetadata} of the Container with the specified ID.
 * Will result in the {@link ContainerStateChangeMessage} message being posted.
 *
 * @public
 */
export interface GetContainerStateMessage extends IInboundMessage {
	type: "GET_CONTAINER_STATE";
	data: {
		/**
		 * The ID of the Container whose metadata is being requested.
		 */
		containerId: string;
	};
}

/**
 * Outbound event indicating a change in the debugger registry (i.e. a debugger has been registered or closed).
 * Includes the new list of active debugger Container IDs.
 *
 * @privateRemarks TODO: do we want separate on-add / on-remove events (let subscribers manage their own lists)?
 *
 * @public
 */
export interface RegistryChangeMessage extends IOutboundMessage {
	type: "REGISTRY_CHANGE";
	data: {
		containers: ContainerMetadata[];
	};
}

/**
 * Outbound event indicating a state change within a Container.
 *
 * @public
 */
export interface ContainerStateChangeMessage extends IOutboundMessage {
	type: "CONTAINER_STATE_CHANGE";
	data: {
		/**
		 * Updated Container state metadata.
		 */
		containerState: ContainerStateMetadata;

		// TODO: change logs
	};
}
