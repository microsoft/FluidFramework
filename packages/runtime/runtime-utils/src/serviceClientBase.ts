/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IAudience } from "@fluidframework/container-definitions";
import { AttachState, type IContainer } from "@fluidframework/container-definitions/internal";
import type { IRequest } from "@fluidframework/core-interfaces";
import { ErasedTypeImplementation } from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import {
	type DataStoreKey,
	type DataStoreKind,
	type FluidContainerAttached,
	type FluidContainerWithService,
	type Registry,
	registryLookup,
} from "@fluidframework/driver-definitions/internal";
import type {
	IContainerRuntimeBase,
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

/*
 * This file provides common implementation logic for ServiceClient implementations.
 *
 */

/**
 * Implementation of `DataStoreKind`.
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
 * Shared base class for all `ServiceClient` container implementations.
 *
 * @remarks
 * Extends `ErasedTypeImplementation` so that
 * {@link getContainerAudience} can narrow via `ServiceContainerBase.narrow()`.
 *
 * @internal
 */
export abstract class ServiceContainerBase<TData, TOptions = unknown>
	extends ErasedTypeImplementation<FluidContainerWithService<TData>>
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
		// The runtime is not part of the public IContainer surface, so it is reached via a structural cast.
		// This relies on an implementation detail of the containers produced by the loader
		// (createDetachedContainer / loadExistingContainer): they carry a `runtime` property.
		// The undefined guard below turns an incompatible container implementation into a clear error
		// instead of a confusing failure later when the missing runtime is used.
		// This is extra risky since IContainer is not marked sealed.
		// TODO: Replace this with a supported, type-safe accessor once the loader exposes one.
		interface IContainerWithRuntime extends IContainer {
			readonly runtime?: IContainerRuntimeBase;
		}

		const container = this.container as IContainerWithRuntime;
		if (container.runtime === undefined) {
			throw new Error(
				"Container does not expose a runtime: incompatible container implementation.",
			);
		}
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
		// The data store's entry point type is erased at the registry boundary;
		// the DataStoreKind<T> used to create it guarantees the entry point is a T.
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
 * created by any {@link @fluidframework/driver-definitions#ServiceClient}.
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
