/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IModelContainerRuntimeEntryPoint } from "@fluid-example/example-utils";
import { mixinAttributor } from "@fluid-experimental/attributor";
import {
	IContainer,
	IContainerContext,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/legacy";
import {
	// eslint-disable-next-line import/no-deprecated -- ContainerRuntime class to be moved to internal scope
	ContainerRuntime,
	IContainerRuntimeOptions,
} from "@fluidframework/container-runtime/legacy";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";
import { NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions/legacy";

// eslint-disable-next-line import/no-deprecated
const containerRuntimeWithAttribution = mixinAttributor(ContainerRuntime);

/**
 * ModelContainerRuntimeFactoryWithAttribution is an abstract class that gives a basic structure for container runtime initialization with attributor enabled.
 * It also requires a createModel method to returns the expected model type.
 */
export abstract class ModelContainerRuntimeFactoryWithAttribution<ModelType>
	implements IRuntimeFactory
{
	public get IRuntimeFactory(): IRuntimeFactory {
		return this;
	}

	/**
	 * @param registryEntries - The data store registry for containers produced
	 * @param runtimeOptions - The runtime options passed to the ContainerRuntime when instantiating it
	 */
	constructor(
		private readonly registryEntries: NamedFluidDataStoreRegistryEntries,
		private readonly runtimeOptions?: IContainerRuntimeOptions,
	) {}

	public async instantiateRuntime(
		context: IContainerContext,
		existing: boolean,
	): Promise<IRuntime> {
		const runtime = await containerRuntimeWithAttribution.loadRuntime({
			context,
			registryEntries: this.registryEntries,
			provideEntryPoint: async (
				containerRuntime: IContainerRuntime,
			): Promise<IModelContainerRuntimeEntryPoint<ModelType>> => ({
				getModel: async (container: IContainer) =>
					this.createModel(containerRuntime, container),
			}),
			runtimeOptions: this.runtimeOptions,
			existing,
		});

		if (!existing) {
			await this.containerInitializingFirstTime(runtime);
		}
		await this.containerHasInitialized(runtime);

		return runtime;
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

	/**
	 * Subclasses must implement createModel, which should build a ModelType given the runtime and container.
	 * @param runtime - The container runtime for the container being initialized
	 * @param container - The container being initialized
	 */
	protected abstract createModel(
		runtime: IContainerRuntime,
		container: IContainer,
	): Promise<ModelType>;
}
