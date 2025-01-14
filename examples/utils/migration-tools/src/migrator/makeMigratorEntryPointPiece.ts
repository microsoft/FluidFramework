/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";
import type { FluidObject } from "@fluidframework/core-interfaces";

import type { IEntryPointPiece } from "../compositeRuntime/index.js";
import { MigrationToolFactory, type IMigrationTool } from "../migrationTool/index.js";

import type {
	ExportDataCallback,
	LoadSourceContainerCallback,
	MigrationCallback,
} from "./interfaces.js";
import { Migrator } from "./migrator.js";

const migratorEntryPointPieceName = "getMigrator";

const migrationToolRegistryKey = "migration-tool";
const migrationToolId = "migration-tool";
const migrationToolFactory = new MigrationToolFactory();

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
 * Create the entry point piece.  This function is called by the container author, who can provide appropriate access
 * to the container data through the ExportDataCallback.
 * @alpha
 */
export const makeMigratorEntryPointPiece = (
	exportDataCallback: ExportDataCallback,
): IEntryPointPiece => {
	return {
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
			// The callback parameters of this returned function cannot be known/performed by the container code author,
			// so we rely on the host to provide them.  Both require the loader layer (at least for current patterns), and
			// migrationCallback additionally will depend on the details of the future version of the code we eventually
			// migrate to.
			return async (
				loadSourceContainerCallback: LoadSourceContainerCallback,
				migrationCallback: MigrationCallback,
			) => {
				const migrationTool = (await getDataStoreEntryPoint(
					runtime,
					migrationToolId,
				)) as IMigrationTool;
				const migrator = new Migrator(
					migrationTool,
					loadSourceContainerCallback,
					exportDataCallback,
					migrationCallback,
				);
				return migrator;
			};
		},
	};
};
