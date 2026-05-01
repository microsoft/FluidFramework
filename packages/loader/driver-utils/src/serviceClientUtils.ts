/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ICodeDetailsLoader,
	IContainerContext,
	IFluidCodeDetails,
	IFluidCodeDetailsComparer,
	IFluidModuleWithDetails,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { FluidObject } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type {
	DataStoreKey,
	DataStoreKind,
	DataStoreRegistry,
	FluidContainerAttached,
	FluidContainerWithService,
	FluidDataStoreRegistryEntry,
	IFluidDataStoreRegistry,
	MinimumVersionForCollab,
	Registry,
	ServiceClient,
} from "@fluidframework/runtime-definitions/internal";
import {
	basicKey,
	DataStoreKindImplementation,
	registryLookup,
} from "@fluidframework/runtime-definitions/internal";

/**
 * The constant ID used for the root data store alias in service containers.
 * @internal
 */
export const rootDataStoreId = "root";

/**
 * Default minimum version for collaboration when none is specified by service options.
 * @internal
 */
export const defaultMinVersionForCollab: MinimumVersionForCollab = "2.0.0";

/**
 * Converts a `DataStoreRegistry` to the `IFluidDataStoreRegistry` interface expected by the container runtime.
 * @internal
 */
export function convertRegistry<T>(registry: DataStoreRegistry<T>): IFluidDataStoreRegistry {
	return {
		async get(name: string): Promise<FluidDataStoreRegistryEntry | undefined> {
			const dataStoreKind = await registryLookup(registry, basicKey(name));
			DataStoreKindImplementation.narrowGeneric(dataStoreKind);
			return dataStoreKind;
		},
		get IFluidDataStoreRegistry(): IFluidDataStoreRegistry {
			return this;
		},
	};
}

/**
 * Normalizes a `DataStoreKind` or registry function into a registry function.
 * @internal
 */
export function normalizeRegistry<T>(
	input: DataStoreKind<T> | Registry<Promise<DataStoreKind<T>>>,
): Registry<Promise<DataStoreKind<T>>> {
	if (DataStoreKindImplementation.guard(input)) {
		return async () => input;
	}
	assert(typeof input === "function", "Registry must be a function");
	return input;
}

/**
 * Parameters passed to a {@link ContainerRuntimeLoader}.
 * @internal
 */
export interface ContainerRuntimeLoaderParams {
	context: IContainerContext;
	registry: IFluidDataStoreRegistry;
	provideEntryPoint: (runtime: IContainerRuntime) => Promise<FluidObject>;
	existing: boolean;
	minVersionForCollab: MinimumVersionForCollab;
	/**
	 * The type string of the root data store to create. Only set when `existing` is false.
	 */
	newContainerRootType: string | undefined;
}

/**
 * A service-specific callback that creates or loads the container runtime.
 *
 * @remarks
 * Receives the runtime parameters assembled by {@link makeCodeLoader} and is responsible for
 * calling the concrete runtime factory (e.g. `ContainerRuntime.loadRuntime2`) and, when
 * `existing` is `false`, initializing the root data store before returning.
 *
 * @internal
 */
export type ContainerRuntimeLoader = (
	parameters: ContainerRuntimeLoaderParams,
) => Promise<IRuntime>;

/**
 * Creates an `ICodeDetailsLoader` that wires up the container runtime via the supplied
 * `loadRuntime` callback.
 *
 * @remarks
 * The `loadRuntime` callback is responsible for invoking the concrete runtime factory and,
 * when `parameters.existing` is `false` and `parameters.newContainerRootType` is set, creating and
 * aliasing the root data store.
 *
 * @internal
 */
export function makeCodeLoader<T>(
	registry: DataStoreRegistry<T>,
	minVersionForCollab: MinimumVersionForCollab,
	loadRuntime: ContainerRuntimeLoader,
	root?: DataStoreKind<T>,
): ICodeDetailsLoader {
	const fluidExport: IRuntimeFactory & IFluidCodeDetailsComparer = {
		async instantiateRuntime(
			context: IContainerContext,
			existing: boolean,
		): Promise<IRuntime> {
			const provideEntryPoint = async (
				entryPointRuntime: IContainerRuntime,
			): Promise<T & FluidObject> => {
				const data = await entryPointRuntime.getAliasedDataStoreEntryPoint(rootDataStoreId);
				if (data === undefined) {
					throw new Error("Root data store missing!");
				}
				const rootDataStore = await data.get();
				return rootDataStore as T & FluidObject;
			};

			return loadRuntime({
				context,
				registry: convertRegistry(registry),
				provideEntryPoint,
				existing,
				minVersionForCollab,
				newContainerRootType: root?.type,
			});
		},

		async satisfies(
			candidate: IFluidCodeDetails,
			constraint: IFluidCodeDetails,
		): Promise<boolean> {
			return true;
		},

		async compare(a: IFluidCodeDetails, b: IFluidCodeDetails): Promise<number | undefined> {
			return 0;
		},

		get IRuntimeFactory(): IRuntimeFactory {
			return fluidExport;
		},

		get IFluidCodeDetailsComparer(): IFluidCodeDetailsComparer {
			return fluidExport;
		},
	};

	return {
		load: async (details: IFluidCodeDetails): Promise<IFluidModuleWithDetails> => {
			return { module: { fluidExport }, details };
		},
	};
}

/**
 * Minimal interface for the static container factory methods used by {@link makeServiceClientImpl}.
 * @internal
 */
export interface ServiceContainerStatics<TOptions> {
	createDetached<T>(
		registry: DataStoreRegistry<T>,
		options: TOptions,
		root: DataStoreKind<T>,
	): Promise<FluidContainerWithService<T>>;

	load<T>(
		registry: DataStoreRegistry<T>,
		options: TOptions,
		id: string,
	): Promise<FluidContainerAttached<T>>;
}

class ServiceClientImpl<TOptions> implements ServiceClient {
	public constructor(
		private readonly options: TOptions,
		private readonly statics: ServiceContainerStatics<TOptions>,
	) {}

	public createContainer<T>(root: DataStoreKind<T>): Promise<FluidContainerWithService<T>>;

	public createContainer<T>(
		root: DataStoreKey<T>,
		registry: Registry<Promise<DataStoreKind>>,
	): Promise<FluidContainerWithService<T>>;

	public async createContainer<T>(
		root: DataStoreKey<T> | DataStoreKind<T>,
		registry?: Registry<Promise<DataStoreKind<T>>>,
	): Promise<FluidContainerWithService<T>> {
		if (registry === undefined) {
			DataStoreKindImplementation.narrowGeneric(root);
			return this.statics.createDetached(normalizeRegistry(root), this.options, root);
		} else {
			const result = await registryLookup(registry, root);
			return this.statics.createDetached(registry, this.options, result);
		}
	}

	public async loadContainer<T>(
		id: string,
		root: DataStoreKind<T> | Registry<Promise<DataStoreKind<T>>>,
	): Promise<FluidContainerAttached<T>> {
		return this.statics.load(normalizeRegistry(root), this.options, id);
	}
}

/**
 * Creates a {@link @fluidframework/runtime-definitions#ServiceClient} that delegates container
 * creation and loading to the supplied container class statics.
 * @internal
 */
export function makeServiceClientImpl<TOptions>(
	options: TOptions,
	statics: ServiceContainerStatics<TOptions>,
): ServiceClient {
	return new ServiceClientImpl(options, statics);
}
