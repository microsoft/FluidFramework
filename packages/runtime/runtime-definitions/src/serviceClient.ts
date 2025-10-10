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
	readonly data: T;

	/**
	 * Create a new detached datastore `T` which can be attached to this container
	 * by adding a handle to it to a datastore which is already attached to the container.
	 * @remarks
	 * `kind` must be included in the registry used to create or load this container.
	 */
	createDataStore(kind: DataStoreKind<T>): Promise<T>;
}

/**
 * A Fluid container with an associated {@link ServiceClient} it can attach to.
 * @sealed
 * @alpha
 */
export interface FluidContainerWithService<T = unknown> extends FluidContainer<T> {
	/**
	 * Attaches this container to the associated service client.
	 *
	 * The returned promise resolves once the container is attached: the container from the promise is the same one passed in as the argument.
	 */
	attach(): Promise<FluidContainerAttached<T>>;

	// This could expose access to the ServiceClient if needed.
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
 * @privateRemarks
 * Type erased {@link IFluidDataStoreFactory}.
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
	// TODO: supporting this and a service independent createContainer would be nice, but is current impractical. Can be added later.
	// attachContainer<T>(detached: FluidContainer<T>): Promise<FluidContainerAttached<T>>;
	/**
	 * Creates a detached container associated with this service client.
	 * @privateRemarks
	 * TODO:As this is a detached container, it should be able to be created synchronously.
	 */
	createContainer<T>(
		root: DataStoreKind<T>,
		registry?: Registry<Promise<DataStoreKind<T>>>,
	): Promise<FluidContainerWithService<T>>;

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
	 *
	 * The ability to provide just a single DataStoreKind<T> is purely a convenience to make it cleaner to use this in simple cases.
	 */
	loadContainer<T>(
		id: string,
		root: DataStoreKind<T> | Registry<Promise<DataStoreKind<T>>>,
	): Promise<FluidContainerAttached<T>>;
}

/**
 * Creates a detached container.
 *
 * @privateRemarks
 * When implemented, this function likely will need to move elsewhere for dependency reasons.
 *
 * # Implementation challenges
 * The current Fluid code (Mainly IContainer and Container.createDetached packages/loader/container-loader/src/container.ts)
 * seem to follow patterns that would make implementing this difficult.
 *
 * Container.createDetached is currently async, which seems unnecessary and undesirable as creation of detached content should be able to be done synchronously.
 *
 * Additionally it seems like the service must be provided at creation time since IContainer.attach exists and does not take the service client implementation.
 *
 * Therefor it is unclear if this proposed API is actually practical to implement.
 *
 * If it is impractical, a workaround could be provided for the shorter term as an alternative async method on the ServiceClient.
 *
 * @alpha
 */
// // TODO: support this as an alternative to ServiceClient.createContainer.
// // This would be nice to have even if there was no way to attach it for non collaborative non persisted use cases.
// export function createContainer<T>(root: DataStoreKind<T>): FluidContainer<T> {
// 	throw new Error("TODO: Not implemented: createContainer");
// }
