/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IContainerContext,
	IRuntime,
} from "@fluidframework/container-definitions/internal";
import {
	FluidDataStoreRegistry,
	loadContainerRuntime,
	type IContainerRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { FluidObject } from "@fluidframework/core-interfaces";
import {
	// eslint-disable-next-line import/no-deprecated
	type RuntimeRequestHandler,
	// eslint-disable-next-line import/no-deprecated
	buildRuntimeRequestHandler,
} from "@fluidframework/request-handler/internal";
import type {
	IFluidDataStoreRegistry,
	IProvideFluidDataStoreRegistry,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions/internal";
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils/internal";

/**
 * {@link BaseContainerRuntimeFactory} construction properties.
 *
 * @internal
 */
export interface BaseContainerRuntimeFactoryProps {
	/**
	 * The data store registry for containers produced.
	 */
	readonly registryEntries: NamedFluidDataStoreRegistryEntries;

	/**
	 * Request handlers for containers produced.
	 * @deprecated Will be removed once Loader LTS version is "2.0.0-internal.7.0.0". Migrate all usage of IFluidRouter to the "entryPoint" pattern. Refer to Removing-IFluidRouter.md
	 */
	// eslint-disable-next-line import/no-deprecated
	readonly requestHandlers?: readonly RuntimeRequestHandler[];

	/**
	 * The runtime options passed to the ContainerRuntime when instantiating it
	 */
	readonly runtimeOptions?: IContainerRuntimeOptions;

	/**
	 * Function that will initialize the entryPoint of the ContainerRuntime instances
	 * created with this factory
	 */
	readonly provideEntryPoint: (runtime: IContainerRuntime) => Promise<FluidObject>;
}

/**
 * BaseContainerRuntimeFactory produces container runtimes with the specified data store and service registries,
 * request handlers, runtimeOptions, and entryPoint initialization function.
 * It can be subclassed to implement a first-time initialization procedure for the containers it creates.
 *
 * @internal
 */
export class BaseContainerRuntimeFactory
	extends RuntimeFactoryHelper
	implements IProvideFluidDataStoreRegistry
{
	/**
	 * {@inheritDoc @fluidframework/runtime-definitions#IProvideFluidDataStoreRegistry.IFluidDataStoreRegistry}
	 */
	public get IFluidDataStoreRegistry(): IFluidDataStoreRegistry {
		return this.registry;
	}
	private readonly registry: IFluidDataStoreRegistry;

	private readonly registryEntries: NamedFluidDataStoreRegistryEntries;
	private readonly runtimeOptions?: IContainerRuntimeOptions;
	// eslint-disable-next-line import/no-deprecated
	private readonly requestHandlers: readonly RuntimeRequestHandler[];
	private readonly provideEntryPoint: (runtime: IContainerRuntime) => Promise<FluidObject>;

	public constructor(props: BaseContainerRuntimeFactoryProps) {
		super();

		this.registryEntries = props.registryEntries;
		this.runtimeOptions = props.runtimeOptions;
		this.provideEntryPoint = props.provideEntryPoint;
		this.requestHandlers = props.requestHandlers ?? [];
		this.registry = new FluidDataStoreRegistry(this.registryEntries);
	}

	/**
	 * Called the one time the container is created, and not on any subsequent load.
	 * i.e. only when it's initialized on the client that first created it
	 * @param runtime - The runtime for the container being initialized
	 */
	public async instantiateFirstTime(runtime: IContainerRuntime): Promise<void> {
		await this.containerInitializingFirstTime(runtime);
		await this.containerHasInitialized(runtime);
	}

	/**
	 * Called every time the container runtime is loaded for an existing container.
	 * i.e. every time it's initialized _except_ for when it is first created
	 * @param runtime - The runtime for the container being initialized
	 */
	public async instantiateFromExisting(runtime: IContainerRuntime): Promise<void> {
		await this.containerHasInitialized(runtime);
	}

	/**
	 * Called at the start of initializing a container, to create the container runtime instance.
	 * @param context - The context for the container being initialized
	 * @param existing - Whether the container already exists and is being loaded (else it's being created new just now)
	 */
	public async preInitialize(
		context: IContainerContext,
		existing: boolean,
	): Promise<IContainerRuntime & IRuntime> {
		return loadContainerRuntime({
			context,
			existing,
			runtimeOptions: this.runtimeOptions,
			registryEntries: this.registryEntries,
			containerScope: context.scope,
			// eslint-disable-next-line import/no-deprecated
			requestHandler: buildRuntimeRequestHandler(...this.requestHandlers),
			provideEntryPoint: this.provideEntryPoint,
		});
	}

	/**
	 * Subclasses may override containerInitializingFirstTime to perform any setup steps at the time the container
	 * is created. This likely includes creating any initial data stores that are expected to be there at the outset.
	 * @param runtime - The container runtime for the container being initialized.
	 * @virtual
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime): Promise<void> {}

	/**
	 * Subclasses may override containerHasInitialized to perform any steps after the container has initialized.
	 * This likely includes loading any data stores that are expected to be there at the outset.
	 * @param runtime - The container runtime for the container being initialized.
	 * @virtual
	 */
	protected async containerHasInitialized(runtime: IContainerRuntime): Promise<void> {}
}
