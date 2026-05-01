/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IAudience } from "@fluidframework/container-definitions";
import { AttachState, type IContainer } from "@fluidframework/container-definitions/internal";
import type { IRequest } from "@fluidframework/core-interfaces";
import {
	type ErasedBaseType,
	ErasedTypeImplementation,
} from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { MinimumVersionForCollab } from "./compatibilityDefinitions.js";
import type {
	IContainerRuntimeBase,
	IFluidDataStoreContext,
	IFluidDataStoreChannel,
} from "./dataStoreContext.js";
import type { IFluidDataStoreFactory } from "./dataStoreFactory.js";
import { registryLookup, type Registry, type RegistryKey } from "./registry.js";

/*
 * This file defines the public API for the ServiceClient and related types.
 *
 * TODO:
 * Currently this API surface expect all code using it together to be using a singly copy of the Fluid Framework client packages.
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
 * A context which has a registry and can create data stores using it.
 * @sealed
 * @alpha
 */
export interface DataStoreCreator {
	/**
	 * Create a new detached datastore `T` which can be attached to the {@link FluidContainer}.
	 * by adding a handle to it to a DataStore or SharedObject which is already attached to the {@link FluidContainer}.
	 * @remarks
	 * `kind` must be included in the registry used to create or load this {@link DataStoreCreator}.
	 */
	createDataStore<T>(kind: DataStoreKey<T>): Promise<T>;
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
 * Implementation of {@link DataStoreKind}.
 * @internal
 */
export class DataStoreKindImplementation<T>
	extends ErasedTypeImplementation<DataStoreKind<T>>
	implements DataStoreKind<T>, IFluidDataStoreFactory
{
	/**
	 * Type guard for narrowing unions which contain DataStoreKind<T> to DataStoreKind<T>.
	 */
	public static guard<T>(
		value: T,
	): value is DataStoreKindImplementation<T extends DataStoreKind<infer T2> ? T2 : never> & T {
		return value instanceof DataStoreKindImplementation;
	}

	/**
	 * Type guard for narrowing unions which contain DataStoreKind<T> to DataStoreKind<T>.
	 */
	public static narrowGeneric<T>(
		value: T,
	): asserts value is DataStoreKindImplementation<
		T extends DataStoreKind<infer T2> ? T2 : never
	> &
		T {
		if (!DataStoreKindImplementation.guard(value)) {
			throw new Error("Invalid DataStoreKindImplementation");
		}
	}

	public readonly type: string;
	public readonly createDataStore?: (context: IFluidDataStoreContext) => {
		readonly runtime: IFluidDataStoreChannel;
	};

	public constructor(
		private readonly factory: Pick<
			DataStoreKindImplementation<T>,
			"type" | "instantiateDataStore" | "createDataStore"
		>,
	) {
		super();
		this.type = factory.type;
		if (factory.createDataStore !== undefined) {
			this.createDataStore = factory.createDataStore.bind(factory);
		}
	}

	public async instantiateDataStore(
		context: IFluidDataStoreContext,
		existing: boolean,
	): Promise<IFluidDataStoreChannel> {
		return this.factory.instantiateDataStore(context, existing);
	}

	public get IFluidDataStoreFactory(): IFluidDataStoreFactory {
		return this;
	}

	public async adapt(value: Promise<DataStoreKind>): Promise<DataStoreKind<T>> {
		const input = await value;
		if (input === this) {
			return this;
		}
		if (input.type === this.type) {
			throw new UsageError(`Conflicting DataStoreKinds with same type: ${this.type}`);
		}
		throw new UsageError(
			`Mismatched DataStoreKind type. Expected: ${this.type}, got: ${input.type}`,
		);
	}
}

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
	createContainer<T>(root: DataStoreKind<T>): Promise<FluidContainerWithService<T>>;

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

/**
 * Shared base class for all {@link ServiceClient} container implementations.
 *
 * @remarks
 * Extends {@link @fluidframework/core-interfaces#ErasedTypeImplementation} so that
 * {@link getContainerAudience} can narrow via `ServiceContainerBase.narrow()`.
 *
 * @internal
 */
export abstract class ServiceContainerBase<TData, TOptions = unknown>
	extends ErasedTypeImplementation<FluidContainer<TData>>
	implements FluidContainerWithService<TData>
{
	/**
	 * True if an attempt to attach has been started. This is used to prevent multiple concurrent attach attempts.
	 */
	private startedAttach = false;

	protected constructor(
		public readonly registry: Registry<Promise<DataStoreKind<TData>>>,
		public readonly options: TOptions,
		public readonly container: IContainer,
		public readonly data: TData,
		public id: string | undefined,
	) {
		super();
	}

	/**
	 * Creates the service-specific request used to attach this container.
	 * @remarks
	 * Called by {@link ServiceContainerBase.attach} after validating that no attach is already in progress.
	 */
	protected abstract createAttachRequest(): IRequest;

	/**
	 * Extracts the container id from {@link ServiceContainerBase.container}'s resolved URL after attachment.
	 * @remarks
	 * Override when the service's resolved URL stores the id in a non-standard field.
	 */
	protected getContainerId(): string {
		if (this.container.resolvedUrl === undefined) {
			throw new Error("Resolved URL unexpectedly missing!");
		}
		return this.container.resolvedUrl.id;
	}

	public async attach(): Promise<FluidContainerAttached<TData>> {
		if (this.id !== undefined) {
			throw new UsageError("Container already attached");
		}
		if (this.startedAttach) {
			throw new UsageError("Container attach already in progress");
		}

		assert(this.container.attachState === AttachState.Detached, "Container not detached");
		this.startedAttach = true;

		// TODO: support setting where attach can fail, and leave the container in a valid (non-closed) state.
		// Likely the best way to support this is by adding a `tryAttach(request): Promise<FluidContainerAttached<TData> | undefined>`.

		await this.container.attach(this.createAttachRequest());
		// This type cast is needed to work around the fact that TypeScript assumes the "attach" methods can't modify "attachState".
		assert(
			this.container.attachState === (AttachState.Attached as AttachState),
			"Container failed to attach",
		);
		this.id = this.getContainerId();
		return this as typeof this & { id: string };
	}

	public get audience(): IAudience {
		return this.container.audience;
	}

	public getRuntime(): IContainerRuntimeBase {
		interface IContainerWithRuntime extends IContainer {
			readonly runtime: IContainerRuntimeBase;
		}

		// TODO: Do something more type safe here.
		const container = this.container as IContainerWithRuntime;
		return container.runtime;
	}

	public close(): void {
		this.container.close();
	}

	public async createDataStore<T>(key: DataStoreKey<T>): Promise<T> {
		const kind = await registryLookup(this.registry, key);
		DataStoreKindImplementation.narrowGeneric(kind);
		const containerRuntime = this.getRuntime();

		// TODO: There should probably be a higher level more type safe way to do this.
		const context = containerRuntime.createDetachedDataStore([kind.type]);
		const channel = await kind.instantiateDataStore(context, false);
		const dataStore = await context.attachRuntime(kind, channel);
		const entryPoint = await dataStore.entryPoint.get();
		return entryPoint as T;
	}
}

/**
 * All clients connected to the op stream, both read-only and read/write.
 * @remarks
 * Currently just {@link @fluidframework/container-definitions#IAudience}, but may diverge before stabilizing.
 * @privateRemarks
 * This is currently just an alias for IAudience, but it is defined separately to allow for:
 * 1. Following the no I prefix naming convention.
 * 2. The possibility of diverging from IAudience in the future if desired.
 * 3. Make it easy for the reexport from fluid-framework to be `@alpha` so the name is not locked down prematurely.
 * @sealed @alpha
 */
export type Audience = IAudience;

/**
 * Gets the {@link Audience} from a Fluid container
 * created by any {@link ServiceClient}.
 * @privateRemarks
 * This is exposed via a free function rather than as a property of FluidContainerAttached
 * for a few minor reasons:
 * 1. This allows stabilizing the FluidContainerAttached API independently committing to how we want to expose the audience.
 * 2. This demonstrates the pattern of how we can have possible less stable APIs to expose service specific features without them being part of the core FluidContainer API.
 * This will be important for both new feature stabilization, and also exposing anything needed for legacy interop.
 * @alpha
 */
export function getContainerAudience(container: FluidContainerAttached): Audience {
	ServiceContainerBase.narrow(container);
	return container.audience;
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
 * Therefore it is unclear if this proposed API is actually practical to implement.
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
