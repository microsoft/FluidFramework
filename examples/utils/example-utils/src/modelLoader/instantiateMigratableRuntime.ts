/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IContainer,
	IContainerContext,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import {
	ContainerRuntime,
	IContainerRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions/internal";

import {
	getDataStoreEntryPoint,
	type IMigrationTool,
	MigrationToolFactory,
} from "../index.js";

/**
 * @internal
 */
export type CreateModelCallback<ModelType> = (
	runtime: IContainerRuntime,
	container: IContainer,
) => Promise<ModelType>;

/**
 * @internal
 */
export interface IMigratableModelContainerRuntimeEntryPoint<T> {
	getModelAndMigrationTool(
		container: IContainer,
	): Promise<{ model: T; migrationTool: IMigrationTool }>;
}

const migrationToolId = "migration-tool";

const migrationToolRegistryKey = "migration-tool";
const migrationToolFactory = new MigrationToolFactory();

/**
 * @internal
 */
export const instantiateMigratableRuntime = async <ModelType>(
	context: IContainerContext,
	existing: boolean,
	registryEntries: NamedFluidDataStoreRegistryEntries,
	createModel: CreateModelCallback<ModelType>,
	runtimeOptions?: IContainerRuntimeOptions,
): Promise<IContainerRuntime & IRuntime> => {
	const combinedRegistryEntries: NamedFluidDataStoreRegistryEntries = [
		...registryEntries,
		[migrationToolRegistryKey, Promise.resolve(migrationToolFactory)],
	];
	const runtime = await ContainerRuntime.loadRuntime({
		context,
		registryEntries: combinedRegistryEntries, // combinedRegistryEntries
		provideEntryPoint: async (
			containerRuntime: IContainerRuntime,
		): Promise<IMigratableModelContainerRuntimeEntryPoint<ModelType>> => ({
			getModelAndMigrationTool: async (container: IContainer) => ({
				// TODO: Think about the timing and order of the awaits
				model: await createModel(containerRuntime, container),
				migrationTool: await getDataStoreEntryPoint(containerRuntime, migrationToolId),
			}),
		}),
		runtimeOptions,
		existing,
	});

	if (!existing) {
		const migrationTool = await runtime.createDataStore(migrationToolRegistryKey);
		await migrationTool.trySetAlias(migrationToolId);
	}
	// Force the MigrationTool to instantiate in all cases.  The Quorum it uses must be loaded and running in
	// order to respond with accept ops, and without this call the MigrationTool won't be instantiated on the
	// summarizer client.
	await getDataStoreEntryPoint(runtime, migrationToolId);

	return runtime;
};

/**
 * @internal
 */
export interface IModelContainerRuntimeEntryPoint<T> {
	getModel(container: IContainer): Promise<T>;
}

/**
 * ModelContainerRuntimeFactory is an abstract class that gives a basic structure for container runtime initialization.
 * It also requires a createModel method to returns the expected model type.
 * @internal
 */
export abstract class MigratableModelContainerRuntimeFactory<ModelType>
	implements IRuntimeFactory
{
	public get IRuntimeFactory() {
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
		const runtime = await instantiateMigratableRuntime(
			context,
			existing,
			this.registryEntries,
			this.createModel.bind(this),
			this.runtimeOptions,
		);

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
