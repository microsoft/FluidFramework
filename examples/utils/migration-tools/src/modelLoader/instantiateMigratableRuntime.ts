/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IContainer,
	IContainerContext,
	IRuntime,
} from "@fluidframework/container-definitions/internal";
import {
	ContainerRuntime,
	IContainerRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions/internal";

import type { IMigrationTool } from "../interfaces/index.js";
import { MigrationToolFactory } from "../migrationTool.js";

async function getDataStoreEntryPoint<T>(
	containerRuntime: IContainerRuntime,
	alias: string,
): Promise<T> {
	const entryPointHandle = (await containerRuntime.getAliasedDataStoreEntryPoint(alias)) as
		| IFluidHandle<T>
		| undefined;

	if (entryPointHandle === undefined) {
		throw new Error(`Default dataStore [${alias}] must exist`);
	}

	return entryPointHandle.get();
}

/**
 * The CreateModelCallback should use the passed runtime and container to construct the model that the
 * host app will interact with.
 * @alpha
 */
export type CreateModelCallback<ModelType> = (
	runtime: IContainerRuntime,
	container: IContainer,
) => Promise<ModelType>;

/**
 * @privateRemarks
 * The MigratableModelLoader expects to work with container runtimes whose entry point conforms to
 * this interface.
 * @alpha
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
 * This helper should be used as a stand-in for ContainerRuntime.loadRuntime when using Migrator and MigratableModelLoader.
 *
 * @privateRemarks
 * In addition to what ContainerRuntime.loadRuntime does, this adds in and correctly initializes the migration tools that
 * Migrator expects to interact with, and exposes an entrypoint that MigratableModelLoader expects to find.
 * TODO: Consider switching to a property bag for parameters.
 * @alpha
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
		registryEntries: combinedRegistryEntries,
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
	// Force the MigrationTool to instantiate in all cases.  The PactMap it uses must be loaded and running in
	// order to respond with accept ops, and without this call the MigrationTool won't be instantiated on the
	// summarizer client.
	await getDataStoreEntryPoint(runtime, migrationToolId);

	return runtime;
};
