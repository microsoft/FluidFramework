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
