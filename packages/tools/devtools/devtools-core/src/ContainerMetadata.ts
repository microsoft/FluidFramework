/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AttachState } from "@fluidframework/container-definitions";
import type { ConnectionState } from "@fluidframework/container-loader";

import type { HasContainerKey } from "./CommonInterfaces.js";

/**
 * Metadata describing a {@link @fluidframework/container-definitions#IContainer}'s core state.
 *
 * @internal
 */
export interface ContainerStateMetadata extends HasContainerKey {
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
	 * Whether or not the Container is in read-only mode.
	 *
	 * @remarks Will be undefined if the readonly state is not yet known.
	 */
	isReadOnly?: boolean;

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.clientId}
	 */
	clientId?: string;

	/**
	 * The active audience identifier when the Container is connected.
	 *
	 * @remarks Will be undefined when the Container is not connected.
	 */
	userId?: string;
}
