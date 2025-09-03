/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IAudience } from "@fluidframework/container-definitions";
import type {
	AttachState,
	IContainerEvents,
	ICriticalContainerError,
} from "@fluidframework/container-definitions/internal";
import type { ConnectionState } from "@fluidframework/container-loader";
import type { IEventProvider } from "@fluidframework/core-interfaces";

/**
 * A lightweight abstraction of a container that provides
 * only the essential properties and methods needed for Fluid DevTools functionality.
 */
export interface DecomposedContainer extends IEventProvider<IContainerEvents> {
	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.audience}
	 */
	readonly audience: IAudience;

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.clientId}
	 */
	readonly clientId?: string | undefined;

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.attachState}
	 */
	readonly attachState: AttachState;

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.connectionState}
	 */
	readonly connectionState: ConnectionState;

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.closed}
	 */
	readonly closed: boolean;

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.connect}
	 */
	connect?(): void;

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.disconnect}
	 */
	disconnect?(): void;

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.close}
	 */
	close?(error?: ICriticalContainerError): void;

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IContainer.readOnlyInfo}
	 */
	readonly readOnlyInfo?: { readonly readonly?: boolean };
}
