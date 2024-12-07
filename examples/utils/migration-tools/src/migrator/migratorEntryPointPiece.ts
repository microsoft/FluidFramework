/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { FluidObject } from "@fluidframework/core-interfaces";

import type { IEntryPointPiece } from "../compositeRuntime/index.js";
import { MigrationToolFactory, type IMigrationTool } from "../migrationTool/index.js";

import {
	type ExportDataCallback,
	type LoadSourceContainerCallback,
	type MigrationCallback,
	Migrator,
} from "./migrator.js";

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
 * Create the entry point piece.  To be called by the container author, who can provide appropriate access to the
 * container data.
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
