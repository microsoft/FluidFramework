/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";

/**
 * Metadata describing a {@link @fluidframework/container-definitions#IContainer} registered with a debugger.
 *
 * @internal
 */
export interface ContainerMetadata {
	/**
	 * The Container ID.
	 */
	id: string;

	/**
	 * Optional Container nickname.
	 *
	 * @remarks
	 *
	 * Associated tooling may take advantage of this to differentiate between container instances using
	 * semantically meaningful names, rather than GUIDs.
	 *
	 * If not provided, the {@link ContainerMetadata.id} will be used for the purpose of distinguising
	 * container instances.
	 */
	nickname?: string;
}

/**
 * Metadata describing a {@link @fluidframework/container-definitions#IContainer}'s core state.
 *
 * @internal
 */
export interface ContainerStateMetadata extends ContainerMetadata {
	/**
	 * Whether or not the Container has been closed (disposed).
	 */
	closed: boolean;

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.attachState}
	 */
	attachState: AttachState;

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.connectionState}
	 */
	connectionState: ConnectionState;

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.clientId}
	 */
	clientId?: string;

	/**
	 * The active audience identifier when the Container is connected.
	 *
	 * @remarks Will be undefined when the Container is not connected.
	 */
	audienceId?: string;
}
