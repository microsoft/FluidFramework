/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { FluidObject } from "@fluidframework/core-interfaces";

import type { IEntryPointPiece } from "../compositeRuntime/index.js";
import { MigrationToolFactory, type IMigrationTool } from "../migrationTool/index.js";
import { type ISimpleLoader, waitForAtLeastSequenceNumber } from "../simpleLoader/index.js";

import type { DataTransformationCallback, IMigratableModel } from "./interfaces.js";
import { getModelAndMigrationToolFromContainer, Migrator } from "./migrator.js";

const migratorEntryPointPieceName = "getMigrator";

const migrationToolRegistryKey = "migration-tool";
const migrationToolFactory = new MigrationToolFactory();
const migrationToolId = "migration-tool";

async function getDataStoreEntryPoint(
	containerRuntime: IContainerRuntime,
	alias: string,
): Promise<FluidObject> {
	const entryPointHandle = await containerRuntime.getAliasedDataStoreEntryPoint(alias);

	if (entryPointHandle === undefined) {
		throw new Error(`Default dataStore [${alias}] must exist`);
	}

	return entryPointHandle.get();
}

/**
 * @alpha
 */
export const migratorEntryPointPiece: IEntryPointPiece = {
	name: migratorEntryPointPieceName,
	registryEntries: [[migrationToolRegistryKey, Promise.resolve(migrationToolFactory)]],
	onCreate: async (runtime: IContainerRuntime): Promise<void> => {
		const migrationTool = await runtime.createDataStore(migrationToolRegistryKey);
		await migrationTool.trySetAlias(migrationToolId);
	},
	onLoad: async (runtime: IContainerRuntime): Promise<void> => {
		// Force the MigrationTool to instantiate in all cases.  The PactMap it uses must be loaded and running in
		// order to respond with accept ops, and without this call the MigrationTool won't be instantiated on the
		// summarizer client.
		await getDataStoreEntryPoint(runtime, migrationToolId);
	},
	createPiece: async (runtime: IContainerRuntime): Promise<FluidObject> => {
		return async (
			loader: ISimpleLoader,
			initialMigratable: IMigratableModel,
			initialId: string,
			container: IContainer,
			dataTransformationCallback?: DataTransformationCallback,
		) => {
			console.log(container.getSpecifiedCodeDetails());
			const migrationTool = (await getDataStoreEntryPoint(
				runtime,
				migrationToolId,
			)) as IMigrationTool;
			const exportData = async (migrationSequenceNumber: number): Promise<unknown> => {
				// Here we load the model to at least the acceptance sequence number and export.  We do this with a
				// separately loaded model to ensure we don't include any local un-ack'd changes.  Late-arriving messages
				// may or may not make it into the migrated data, there is no guarantee either way.
				// TODO: Consider making this a read-only client
				const exportContainer = await loader.loadExisting(initialId);
				await waitForAtLeastSequenceNumber(exportContainer, migrationSequenceNumber);
				// TODO: verify IMigratableModel
				const { model: exportModel } =
					await getModelAndMigrationToolFromContainer<IMigratableModel>(exportContainer);
				const exportedData = await exportModel.exportData();
				exportContainer.dispose();
				return exportedData;
			};
			const migrator = new Migrator(
				loader,
				initialMigratable,
				migrationTool,
				initialId,
				exportData,
				dataTransformationCallback,
			);
			return migrator;
		};
	},
};
