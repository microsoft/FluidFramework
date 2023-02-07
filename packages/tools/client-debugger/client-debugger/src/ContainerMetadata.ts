/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";

/**
 * Metadata describing a {@link @fluidframework/container-definitions#IContainer} registered with a debugger.
 *
 * @public
 */
export interface ContainerMetadata {
	/**
	 * The Container ID.
	 */
	id: string; // TODO: rename to "containerId"

	/**
	 * Optional Container nickname.
	 */
	nickname?: string; // TODO: rename to "containerNickname"
}

/**
 * Metadata describing a {@link @fluidframework/container-definitions#IContainer}'s core state.
 *
 * @public
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
}
