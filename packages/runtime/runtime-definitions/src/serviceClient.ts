/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedType } from "@fluidframework/core-interfaces";

import type { MinimumVersionForCollab } from "./compatibilityDefinitions.js";

/**
 * Options for configuring a {@link ServiceClient}.
 * @remarks
 * These are the options which apply to all services.
 *
 * Individual services will extend with with additional options.
 *
 * @input
 * @alpha
 */
export interface ServiceOptions {
	readonly minVersionForCollab: MinimumVersionForCollab;
}

/**
 * A Fluid container.
 * @remarks
 * A document which can be stored to or loaded from a Fluid service using a {@link ServiceClient}.
 *
 * @sealed
 * @alpha
 */
export interface FluidContainer<T = unknown> {
	/**
	 * The unique identifier for this container, if it has been attached to a service.
	 */
	readonly id?: string | undefined;

	/**
	 * The root data store of the container.
	 * @remarks
	 * The type of the root data store is defined by the {@link DataStoreKind} used to create the container.
	 */
	readonly root: T;
}

/**
 * A Fluid container that has been attached to a service.
 * @sealed
 * @alpha
 */
export interface FluidContainerAttached<T = unknown> extends FluidContainer<T> {
	/**
	 * {@inheritdoc FluidContainer.id}
	 */
	readonly id: string;
}

/**
 * TODO:
 * These should be usable as SharedObjectKinds:
 * either make DataStoreFactory extend SharedObjectKinds, or make SharedObjectKind explicitly include DataStoreFactory.
 * @sealed
 * @alpha
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface DataStoreKind<T> extends ErasedType<readonly ["DataStoreFactory", T]> {}

/**
 * A connection to a Fluid storage service.
 * @sealed
 * @alpha
 */
export interface ServiceClient {
	/**
	 * Attaches a detached container.
	 *
	 * The returned promise resolves once the container is attached: the container from the promise is the same one passed in as the argument.
	 */
	attachContainer<T>(detached: FluidContainer<T>): Promise<FluidContainerAttached<T>>;

	/**
	 * Loads an existing container from the service.
	 */
	loadContainer<T>(id: string, root: DataStoreKind<T>): Promise<FluidContainerAttached<T>>;
}

/**
 * Creates a detached container.
 *
 * @alpha
 */
export function createContainer<T>(root: DataStoreKind<T>): FluidContainer<T> {
	throw new Error("Not implemented: createContainer");
}
