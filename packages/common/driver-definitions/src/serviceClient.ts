/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedBaseType } from "@fluidframework/core-interfaces/internal";

/**
 * This file defines the external facing API for the {@link ServiceClient} and related types.
 *
 * All code interacting through this API surface within a single client must avoid using multiple copies of any Fluid Framework client package (at the same or different versions).
 * This mirrors the `@public` "declarative model" APIs and is a deliberate simplification of what is allowed in the legacy API surface.
 * It is enforced best-effort only: `@sealed` nominal erased types catch many mismatches at compile time, and factory identity checks throw a UsageError ("Conflicting ... with same type") at run time, but the checking is not exhaustive.
 * See `LayerCompatibilityUnified.md` for the full policy, rationale, and failure signatures.
 *
 * TODO:
 * Before stabilizing any of this past beta, evaluate whether this single-copy requirement must be relaxed, and if so how.
 * Whatever rule is chosen (relaxed or not) should be enforced at both compile time and run time as much as possible.
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
 * A string in SemVer format indicating a specific version of the Fluid Framework client package, or the special case of {@link @fluidframework/runtime-utils#defaultMinVersionForCollab}.
 *
 * Collaboration with other clients is only supported when all Fluid Framework client packages used by the client have a version that is greater than or equal
 * to the specified `MinimumVersionForCollaboration`.
 *
 * Cannot exceed the version of any Fluid Framework client package in use by the local client.
 *
 * The higher the version specified, the more features and optimizations will be enabled. *
 * @privateRemarks
 * This is similar to, and a subset of, the `MinimumVersionForCollab` type in `@fluidframework/runtime-definitions`.
 * This differs in that:
 * - This avoids the shorthand "collab" to instead align with our preferred whole word naming convention.
 * - This is `alpha` instead of `public`.
 * - This is available to drivers due to its location in `driver-definitions` instead of `runtime-definitions`.
 * - This does not allow requesting collaboration with pre-2.0.0 versions, including the special case of `2.0.0-defaults`.
 * - Patch versions cannot be set: a given minor release is not guaranteed to be greater or equal compat wise to all patches of the previous release, so we do not enable features based on patch versions (instead fall back to the next minor if needed).
 * Therefore allowing patch versions here could be misleading and could lead to bugs.
 *
 * @input
 * @alpha
 */
export type MinimumVersionForCollaboration = `2.${bigint}.0`;

/**
 * Strips patch and prerelease from a SemVer string, returning only the major and minor version.
 * @remarks
 * This formats a version in the same style used by {@link MinimumVersionForCollaboration}, specifying only the major and minor versions,
 * which are the portions used for feature selection.
 * @privateRemarks
 * This fills a similar role as cleanedPackageVersion in `@fluidframework/runtime-utils`.
 * It can be used to workaround our generated pkgVersion values being invalid `MinimumVersionForCollaboration` on CI (due to prerelease) or patched release branches.
 * @alpha
 */
export function featureVersion<major extends `${bigint}`, minor extends `${bigint}`>(
	version: `${major}.${minor}.${bigint}-${string}` | `${major}.${minor}.${bigint}`,
): `${major}.${minor}.0` {
	// The SemVer package could be used to parse this version, but it wouldn't gain us anything, and would just make it harder to determine that the down casting below is valid.
	// Since we have a strongly typed string input, we know exactly which formats are allowed, so we don't need its more general parsing and validation either.
	// If we wanted to preserve the patch or prerelease version, that would require more complex parsing and would justify using the SemVer package, but we don't need that here.
	const parsed = version.split(".");
	return `${parsed[0] as major}.${parsed[1] as minor}.0`;
}

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
	readonly minVersionForCollaboration: MinimumVersionForCollaboration;
}

/**
 * A {@link RegistryKey} for a {@link DataStoreKind}.
 * @remarks
 * This is implemented by {@link DataStoreKind}, but alternative implementations can be used if needed.
 *
 * If you want lazy loading and need a key that does not eagerly load the {@link DataStoreKind}, an alternative {@link DataStoreKey} can be implemented.
 * @privateRemarks
 * TODO: A built in common pattern for the lazy key case should be provided.
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
	 * `kind` will be looked up in the {@link Registry} used to create or load this {@link DataStoreCreator}.
	 * It is up to that registry to decide how it handles unknown types, for example by throwing an exception or returning a placeholder.
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
 * We have made the close remove all the timers, so the the dispose step should be unnecessary and we can just have a single closed state.
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
 * Describes a kind of data store, and allows creating and loading instances of it.
 * @remarks
 * A `DataStoreKind` acts as the factory and type descriptor for a category of data store:
 * it defines the `type` used to identify the data store in a {@link DataStoreRegistry},
 * and the `T` API surface that instances of that data store expose.
 *
 * Provide a `DataStoreKind` to {@link ServiceClient.(createContainer:1)} or {@link DataStoreCreator.createDataStore}
 * to create new instances, and to {@link ServiceClient.loadContainer} to load existing ones.
 *
 * A `DataStoreKind` is not constructed directly.
 * Instead, obtain one from a framework-provided factory:
 * use {@link @fluidframework/shared-object-base#dataStoreKind} to build a data store from a root shared object,
 * or use a more specific wrapper around it, such as {@link @fluidframework/tree#treeDataStoreKind} for a {@link @fluidframework/tree#TreeView}-backed data store.
 *
 * Since it implements {@link DataStoreKey}, a `DataStoreKind` can also be used directly as the key to look
 * itself up in a {@link Registry}.
 * @privateRemarks
 * TODO:
 * SharedObjects should be usable as these (though putting shared objects directly in the container might need special logic).
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
	 * @throws a {@link @fluidframework/telemetry-utils#UsageError} if the DataStoreKind's type (either the root directly or looked up from the registry) does not match the type of the root data store in the container.
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
