/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedBaseType } from "@fluidframework/core-interfaces/internal";

/*
 * This file defines the public API for the ServiceClient and related types.
 *
 * TODO:
 * Currently this API surface expect all code using it together to be using a single copy of the Fluid Framework client packages.
 *
 * Before stabilizing any of this past beta, it should be evaluated if this requirement needs to be relaxed, and if so how to do that.
 * Regardless of if its relaxed or not, what ever rules are put in place should be runtime and compile time enforced as much as possible.
 *
 * TODO:
 * Fault isolation should be considered in this API design.
 * When are exceptions recoverable and how?
 * Likely we can fault isolate exceptions to containers in most cases,
 * and containers can indicate their status by being closed or disposed.
 * Non fatal errors should not be exceptions.
 */

// #region Registry types

/**
 * A collection of entries looked up by a `type` string.
 * @remarks
 * Use of a function for this allows a few things that most collections would not:
 * 1. It's possible to generate placeholder / error values on demand.
 * 2. It makes loading from some external registry on demand practical.
 * 3. The lookup can throw an exception if appropriate (this would typically indicate a bug and produce a fatal error).
 * 4. Generation of values can be lazy, and even asynchronous if `T` allows for a promise.
 *
 * This flexibility lets the implementer decide how to handle requests for unknown types.
 * They can produce placeholders, assert, fall back to a generic implementation etc.
 * @input
 * @alpha
 */
export type Registry<T> = (type: string) => T;

/**
 * A strongly typed key for a {@link Registry}.
 * Use with {@link registryLookup}.
 * @remarks
 * Used to look up a `T` in a `Registry<T>`, and produce a `TOut` from it.
 * @privateRemarks
 * This is currently input and sealed, meaning effectively type erased since the design might change.
 * @input
 * @sealed
 * @alpha
 */
export interface RegistryKey<TOut, TIn = unknown> {
	/**
	 * Identifier to provide to the {@link Registry}.
	 */
	readonly type: string;

	/**
	 * Convert a value from the registry to the desired output type.
	 * @remarks
	 * How this is done is up to the implementation.
	 *
	 * This might be a type guard which throws if the input is not valid.
	 * Or it could be a conversion, an identity function, or something else.
	 *
	 * @param value - The value from the registry.
	 * @returns The converted value.
	 */
	adapt(value: TIn): TOut;
}

/**
 * Lookup an entry in a {@link Registry} using a {@link RegistryKey}.
 * @alpha
 */
export function registryLookup<TOut, TIn>(
	registry: Registry<TIn>,
	key: RegistryKey<TOut, TIn>,
): TOut {
	return key.adapt(registry(key.type));
}

/**
 * Creates a simple {@link RegistryKey} which does no type conversion.
 * @alpha
 */
export function basicKey<T>(type: string): RegistryKey<T, T> {
	return {
		type,
		adapt: (value) => value,
	};
}

// #endregion

// #region ServiceClient types

/**
 * Oldest version of Fluid Framework client packages to support collaborating with.
 * @remarks
 * String in a SemVer format indicating a specific version of the Fluid Framework client package, or the special case of {@link @fluidframework/runtime-utils#defaultMinVersionForCollab}.
 *
 * When specifying a given `MinimumVersionForCollab`, any client with a version that is greater than or equal to the specified version will be considered compatible.
 *
 * Must be at least {@link @fluidframework/runtime-utils#lowestMinVersionForCollab} and cannot exceed the current version.
 *
 * {@link @fluidframework/runtime-utils#validateMinimumVersionForCollab} can be used to check these invariants at runtime.
 * Since TypeScript cannot enforce them all for literals in code,
 * it may be useful to use `validateMinimumVersionForCollab` values which may come from constants in the codebase typed as a `MinimumVersionForCollab`.
 *
 * @privateRemarks
 * Since this uses the semver notion of "greater" (which might not actually mean a later release, or supporting more features), care must be taken with how this is used.
 * See remarks for {@link @fluidframework/runtime-utils#MinimumMinorSemanticVersion} for more details.
 *
 * Since this type is marked with `@input`, it can be generalized to allow more cases in the future as a non-breaking change.
 *
 * TODO: before stabilizing this further, some restrictions should be considered (since once stabilized, this can be relaxed, but not more constrained).
 * For example it might make sense to constrain this to something like `"1.4.0" | typeof defaultMinVersionForCollab | 2.${bigint}.0"`.
 *
 * @input
 * @public
 */
export type MinimumVersionForCollab =
	| `${1 | 2}.${bigint}.${bigint}`
	| `${1 | 2}.${bigint}.${bigint}-${string}`;

/**
 * Options for configuring a {@link ServiceClient}.
 * @remarks
 * These are the options which apply to all services.
 *
 * Individual services will extend with additional options.
 *
 * @input
 * @alpha
 */
export interface ServiceOptions {
	readonly minVersionForCollab: MinimumVersionForCollab;
}

/**
 * A {@link RegistryKey} for a {@link DataStoreKind}.
 * @remarks
 * This is implemented by {@link DataStoreKind}, but alternative implementations can be used if needed.
 *
 * If you want lazy loading and need a key that does not eagerly load the {@link DataStoreKind}, an alternative {@link DataStoreKey} can be implemented.
 * @privateRemarks
 * TODO: A built in common pattern for the lazy key case should be provided.
 * TODO: this same key pattern should be applied to SharedObjectKind.
 * TODO: things probably break if "adapt" does anything except throw or return the result from the input promise.
 * @input
 * @alpha
 */
export type DataStoreKey<T, TAll = unknown> = RegistryKey<
	Promise<DataStoreKind<T>>,
	Promise<DataStoreKind<TAll>>
>;

/**
 * A context which has a registry and can create data stores using it.
 * @sealed
 * @alpha
 */
export interface DataStoreCreator {
	/**
	 * Create a new detached datastore `T` which can be attached to the {@link FluidContainer}.
	 * by adding a handle to a DataStore or SharedObject which is already attached to the {@link FluidContainer}.
	 * @remarks
	 * `kind` must be included in the registry used to create or load this {@link DataStoreCreator}.
	 */
	createDataStore<T>(kind: DataStoreKey<T>): Promise<T>;
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
 * The underlying IContainer has a lifecycle which includes both a closed and disposed state.
 * This should be avoidable: the closed but not disposed state exists so its possible to read out some state at that time.
 * We have made the close remove all the timers, so the the dispose step is be unnecessary and we can just have a single closed state.
 *
 * @sealed
 * @alpha
 */
export interface FluidContainer<TData = unknown>
	extends DataStoreCreator,
		ErasedBaseType<readonly ["FluidContainer", TData]> {
	/**
	 * The unique identifier for this container, if it has been attached to a service.
	 */
	readonly id?: string | undefined;

	/**
	 * The root data store of the container.
	 * @remarks
	 * The type of the root data store is defined by the {@link DataStoreKind} used to create the container.
	 */
	readonly data: TData;

	/**
	 * Close the container, stopping all networking and cancelling runtime timers.
	 *
	 * @remarks
	 * After calling `close()`, the container's data can still be read but no further operations can be sent.
	 * @privateRemarks
	 * TODO: we should document the what the expected behavior is if one tries to modify the data after close, or tries to call close multiple times.
	 * TODO: we also likely want to have a way to detect if closed and events for on close.
	 */
	close(): void;
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
 * SharedObjects should be usable as these (putting shared objects directly in the container might need special logic).
 * @privateRemarks
 * Type erased {@link IFluidDataStoreFactory}.
 * @sealed
 * @alpha
 */
export interface DataStoreKind<out T = unknown>
	extends DataStoreKey<T>,
		ErasedBaseType<readonly ["DataStoreKind", T]> {}

/**
 * A registry of {@link DataStoreKind}s.
 * @remarks
 * TODO: unify this with SharedObjectRegistry.
 *
 * @input
 * @alpha
 */
export type DataStoreRegistry<out T = unknown> = Registry<Promise<DataStoreKind<T>>>;

/**
 * A connection to a Fluid storage service.
 * @sealed
 * @alpha
 */
export interface ServiceClient {
	/**
	 * Creates a detached container associated with this service client.
	 * @privateRemarks
	 * TODO: As this is a detached container, it should be able to be created synchronously.
	 *
	 * TODO: Provide more general alternative to this in the form of a service-independent `createContainer` free function.
	 * It would work with a `ServiceClient.attachContainer<T>(detached: FluidContainer<T>): Promise<FluidContainerAttached<T>>`
	 * which returns a promise that resolves once the detached container has been attached
	 * (pointing to the same container object, but with the new type).
	 *
	 * Challenges:
	 *
	 * Currently the service must be provided at creation time because `IContainer.attach` does not accept a service client,
	 * making it unclear whether a truly service-independent path is feasible in the near term.
	 */
	createContainer<T>(root: DataStoreKind<T>): Promise<FluidContainerWithService<T>>;

	/**
	 * Creates a detached container associated with this service client.
	 * @param root - A {@link DataStoreKey} used to look up the root's {@link DataStoreKind} from `registry`.
	 * @param registry - The {@link DataStoreRegistry} supplying the {@link DataStoreKind} for the root and any other data stores the container may need to create.
	 * @remarks
	 * Use this overload when the root {@link DataStoreKind} is not available eagerly (e.g. for lazy loading),
	 * or when the container needs a registry for creating additional data stores beyond the root.
	 */
	createContainer<T>(
		root: DataStoreKey<T>,
		registry: DataStoreRegistry,
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
		root: DataStoreKind<T> | DataStoreRegistry<T>,
	): Promise<FluidContainerAttached<T>>;
}

// #endregion
