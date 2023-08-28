/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext } from "@fluidframework/container-definitions";
import {
	IContainerRuntimeOptions,
	FluidDataStoreRegistry,
	ContainerRuntime,
} from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { RuntimeRequestHandler, buildRuntimeRequestHandler } from "@fluidframework/request-handler";
import {
	IFluidDataStoreRegistry,
	IProvideFluidDataStoreRegistry,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import {
	DependencyContainer,
	IFluidDependencySynthesizer,
	IProvideFluidDependencySynthesizer,
} from "@fluidframework/synthesize";
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils";
import { FluidObject } from "@fluidframework/core-interfaces";

/**
 * BaseContainerRuntimeFactory produces container runtimes with the specified data store and service registries,
 * request handlers, runtimeOptions, and entryPoint initialization function.
 * It can be subclassed to implement a first-time initialization procedure for the containers it creates.
 */
export class BaseContainerRuntimeFactory
	extends RuntimeFactoryHelper
	implements IProvideFluidDataStoreRegistry
{
	public get IFluidDataStoreRegistry() {
		return this.registry;
	}
	private readonly registry: IFluidDataStoreRegistry;

	/**
	 * @param registryEntries - The data store registry for containers produced
	 * @param dependencyContainer - deprecated, will be removed in a future release
	 * @param requestHandlers - Request handlers for containers produced
	 * @param runtimeOptions - The runtime options passed to the ContainerRuntime when instantiating it
	 * @param initializeEntryPoint - Function that will initialize the entryPoint of the ContainerRuntime instances
	 * created with this factory
	 */
	constructor(
		private readonly registryEntries: NamedFluidDataStoreRegistryEntries,
		private readonly dependencyContainer?: IFluidDependencySynthesizer,
		private readonly requestHandlers: RuntimeRequestHandler[] = [],
		private readonly runtimeOptions?: IContainerRuntimeOptions,
		private readonly initializeEntryPoint?: (
			runtime: IContainerRuntime,
		) => Promise<FluidObject>,
	) {
		super();
		this.registry = new FluidDataStoreRegistry(registryEntries);
	}

	public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
		await this.containerInitializingFirstTime(runtime);
		await this.containerHasInitialized(runtime);
	}

	public async instantiateFromExisting(runtime: ContainerRuntime): Promise<void> {
		await this.containerHasInitialized(runtime);
	}

	public async preInitialize(
		context: IContainerContext,
		existing: boolean,
	): Promise<ContainerRuntime> {
		const scope: Partial<IProvideFluidDependencySynthesizer> = context.scope;
		if (this.dependencyContainer) {
			const dc = new DependencyContainer<FluidObject>(
				this.dependencyContainer,
				scope.IFluidDependencySynthesizer,
			);
			scope.IFluidDependencySynthesizer = dc;
		}

		const augment = this.initializeEntryPoint
			? { initializeEntryPoint: this.initializeEntryPoint }
			: { requestHandler: buildRuntimeRequestHandler(...this.requestHandlers) };

		return ContainerRuntime.loadRuntime({
			context,
			existing,
			runtimeOptions: this.runtimeOptions,
			registryEntries: this.registryEntries,
			containerScope: scope,
			...augment,
		});
	}

	/**
	 * Subclasses may override containerInitializingFirstTime to perform any setup steps at the time the container
	 * is created. This likely includes creating any initial data stores that are expected to be there at the outset.
	 * @param runtime - The container runtime for the container being initialized
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {}

	/**
	 * Subclasses may override containerHasInitialized to perform any steps after the container has initialized.
	 * This likely includes loading any data stores that are expected to be there at the outset.
	 * @param runtime - The container runtime for the container being initialized
	 */
	protected async containerHasInitialized(runtime: IContainerRuntime) {}
}
