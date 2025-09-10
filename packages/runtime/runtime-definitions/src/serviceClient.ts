/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedType } from "@fluidframework/core-interfaces";

import type { MinimumVersionForCollab } from "./compatibilityDefinitions.js";

/**
 * A collection of entries looked up by a `type` string.
 * @remarks
 * Use of a function for this allows a few things that most collections would not:
 * 1. It's possible to generate placeholder / error values on demand.
 * 2. It makes loading from some external registry on demand practical.
 * 3. The lookup can throw an exception is appropriate
 * (the implementer can decide how to handle requests for unknown types, producing placeholders or errors).
 * @input
 * @alpha
 */
export type Registry<T> = (type: string) => T;

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
 * @privateRemarks
 * This will likely end up needing many of IFluidContainer's APIs, like disconnect, connectionState, events etc.
 * Before adding them though, care should be taken to consider if they can be improved or simplified.
 * For example maybe a single status enum for `detached -> attaching -> dirty -> saved -> closed` would be good.
 * Or maybe `detached -> attaching -> attached -> closed` and a timer for how long since the last unsaved change was created.
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
	 * @param id - The unique identifier of the container to load.
	 * @param root - The {@link DataStoreKind} for the root, or a registry which will be used to look up the root based on its type.
	 *
	 * @throws a UsageError if the DataStoreKind's type (either the root directly or looked up from the registry) does not match the type of the root data store in the container.
	 *
	 * @privateRemarks
	 * The ability to provide a registry here means that it's possible to:
	 * 1. Load a container which might have a few different possible roots, for example because of versioning.
	 * 2. Generate the DataStoreKind on demand based on the type: this approach could be used for things like debug tools which can load any possible container.
	 * 3. Generating the DataStoreKind if the type is unrecognized, for example to provide a placeholder which might support some minimal functionality (like debug inspection, and summary).
	 */
	loadContainer<T>(
		id: string,
		root: DataStoreKind<T> | Registry<Promise<DataStoreKind<T>>>,
	): Promise<FluidContainerAttached<T>>;
}

/**
 * Creates a detached container.
 *
 * @alpha
 */
export function createContainer<T>(root: DataStoreKind<T>): FluidContainer<T> {
	throw new Error("Not implemented: createContainer");
}
