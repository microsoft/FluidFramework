/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IContainerContext,
	IRuntime,
} from "@fluidframework/container-definitions/internal";
import {
	// eslint-disable-next-line import/no-deprecated -- ContainerRuntime class to be moved to internal scope
	ContainerRuntime,
	FluidDataStoreRegistry,
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
import {
	DependencyContainer,
	type IFluidDependencySynthesizer,
	type IProvideFluidDependencySynthesizer,
} from "@fluidframework/synthesize/internal";

/**
 * {@link BaseContainerRuntimeFactory} construction properties.
 * @legacy
 * @alpha
 */
export interface BaseContainerRuntimeFactoryProps {
	/**
	 * The data store registry for containers produced.
	 */
	registryEntries: NamedFluidDataStoreRegistryEntries;
	/**
	 * @deprecated Will be removed in a future release.
	 */
	dependencyContainer?: IFluidDependencySynthesizer;
	/**
	 * Request handlers for containers produced.
	 * @deprecated Will be removed once Loader LTS version is "2.0.0-internal.7.0.0". Migrate all usage of IFluidRouter to the "entryPoint" pattern. Refer to Removing-IFluidRouter.md
	 */
	// eslint-disable-next-line import/no-deprecated
	requestHandlers?: RuntimeRequestHandler[];
	/**
	 * The runtime options passed to the ContainerRuntime when instantiating it
	 */
	runtimeOptions?: IContainerRuntimeOptions;
	/**
	 * Function that will initialize the entryPoint of the ContainerRuntime instances
	 * created with this factory
	 */
	provideEntryPoint: (runtime: IContainerRuntime) => Promise<FluidObject>;
}

/**
 * BaseContainerRuntimeFactory produces container runtimes with the specified data store and service registries,
 * request handlers, runtimeOptions, and entryPoint initialization function.
 * It can be subclassed to implement a first-time initialization procedure for the containers it creates.
 * @legacy
 * @alpha
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
	private readonly dependencyContainer?: IFluidDependencySynthesizer;
	private readonly runtimeOptions?: IContainerRuntimeOptions;
	// eslint-disable-next-line import/no-deprecated
	private readonly requestHandlers: RuntimeRequestHandler[];
	private readonly provideEntryPoint: (runtime: IContainerRuntime) => Promise<FluidObject>;

	public constructor(props: BaseContainerRuntimeFactoryProps) {
		super();

		this.registryEntries = props.registryEntries;
		this.dependencyContainer = props.dependencyContainer;
		this.runtimeOptions = props.runtimeOptions;
		this.provideEntryPoint = props.provideEntryPoint;
		this.requestHandlers = props.requestHandlers ?? [];
		this.registry = new FluidDataStoreRegistry(this.registryEntries);
	}

	/**
	 * @deprecated Use the overload taking in an IContainerRuntime
	 */
	// eslint-disable-next-line import/no-deprecated -- ContainerRuntime class to be moved to internal scope
	public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void>;
	/**
	 * Called the one time the container is created, and not on any subsequent load.
	 * i.e. only when it's initialized on the client that first created it
	 * @param runtime - The runtime for the container being initialized
	 */
	public async instantiateFirstTime(runtime: IContainerRuntime): Promise<void>;
	public async instantiateFirstTime(
		// eslint-disable-next-line import/no-deprecated -- ContainerRuntime class to be moved to internal scope
		runtime: IContainerRuntime | ContainerRuntime,
	): Promise<void> {
		await this.containerInitializingFirstTime(runtime);
		await this.containerHasInitialized(runtime);
	}

	/**
	 * @deprecated Use the overload taking in an IContainerRuntime
	 */
	// eslint-disable-next-line import/no-deprecated -- ContainerRuntime class to be moved to internal scope
	public async instantiateFromExisting(runtime: ContainerRuntime): Promise<void>;
	/**
	 * Called every time the container runtime is loaded for an existing container.
	 * i.e. every time it's initialized _except_ for when it is first created
	 * @param runtime - The runtime for the container being initialized
	 */
	public async instantiateFromExisting(runtime: IContainerRuntime): Promise<void>;
	public async instantiateFromExisting(
		// eslint-disable-next-line import/no-deprecated -- ContainerRuntime class to be moved to internal scope
		runtime: IContainerRuntime | ContainerRuntime,
	): Promise<void> {
		await this.containerHasInitialized(runtime);
	}

	/**
	 * @deprecated Use the overload that returns an IContainerRuntime & IRuntime
	 */
	public async preInitialize(
		context: IContainerContext,
		existing: boolean,
		// eslint-disable-next-line import/no-deprecated -- ContainerRuntime class to be moved to internal scope
	): Promise<ContainerRuntime>;
	/**
	 * Called at the start of initializing a container, to create the container runtime instance.
	 * @param context - The context for the container being initialized
	 * @param existing - Whether the container already exists and is being loaded (else it's being created new just now)
	 */
	public async preInitialize(
		context: IContainerContext,
		existing: boolean,
	): Promise<IContainerRuntime & IRuntime>;
	public async preInitialize(
		context: IContainerContext,
		existing: boolean,
		// eslint-disable-next-line import/no-deprecated -- ContainerRuntime class to be moved to internal scope
	): Promise<ContainerRuntime> {
		const scope: Partial<IProvideFluidDependencySynthesizer> = context.scope;
		if (this.dependencyContainer) {
			const dc = new DependencyContainer<FluidObject>(
				this.dependencyContainer,
				scope.IFluidDependencySynthesizer,
			);
			scope.IFluidDependencySynthesizer = dc;
		}

		// eslint-disable-next-line import/no-deprecated -- ContainerRuntime class to be moved to internal scope
		return ContainerRuntime.loadRuntime({
			context,
			existing,
			runtimeOptions: this.runtimeOptions,
			registryEntries: this.registryEntries,
			containerScope: scope,
			// eslint-disable-next-line import/no-deprecated
			requestHandler: buildRuntimeRequestHandler(...this.requestHandlers),
			provideEntryPoint: this.provideEntryPoint,
		});
	}

	/**
	 * Subclasses may override containerInitializingFirstTime to perform any setup steps at the time the container
	 * is created. This likely includes creating any initial data stores that are expected to be there at the outset.
	 * @param runtime - The container runtime for the container being initialized
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime): Promise<void> {}

	/**
	 * Subclasses may override containerHasInitialized to perform any steps after the container has initialized.
	 * This likely includes loading any data stores that are expected to be there at the outset.
	 * @param runtime - The container runtime for the container being initialized
	 */
	protected async containerHasInitialized(runtime: IContainerRuntime): Promise<void> {}
}
