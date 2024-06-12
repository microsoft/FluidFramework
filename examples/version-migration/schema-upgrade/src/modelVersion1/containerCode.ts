/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IMigrationTool } from "@fluid-example/example-utils";
import {
	MigrationToolFactory,
	ModelContainerRuntimeFactory,
	getDataStoreEntryPoint,
} from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";

import type { IInventoryList, IInventoryListAppModel } from "../modelInterfaces.js";

import { InventoryListAppModel } from "./appModel.js";
import { InventoryListInstantiationFactory } from "./inventoryList.js";

const inventoryListId = "default-inventory-list";
const migrationToolId = "migration-tool";

const migrationToolRegistryKey = "migration-tool";
const migrationToolFactory = new MigrationToolFactory();

/**
 * @internal
 */
export class InventoryListContainerRuntimeFactory extends ModelContainerRuntimeFactory<IInventoryListAppModel> {
	/**
	 * Constructor for the factory. Supports a test mode which spawns the summarizer instantly.
	 * @param testMode - True to enable instant summarizer spawning.
	 */
	public constructor(testMode: boolean) {
		super(
			new Map([
				InventoryListInstantiationFactory.registryEntry,
				[migrationToolRegistryKey, Promise.resolve(migrationToolFactory)],
			]), // registryEntries
			testMode
				? {
						summaryOptions: {
							initialSummarizerDelayMs: 0,
						},
					}
				: undefined,
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const inventoryList = await runtime.createDataStore(
			InventoryListInstantiationFactory.type,
		);
		await inventoryList.trySetAlias(inventoryListId);
		const migrationTool = await runtime.createDataStore(migrationToolRegistryKey);
		await migrationTool.trySetAlias(migrationToolId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerHasInitialized}
	 */
	protected async containerHasInitialized(runtime: IContainerRuntime) {
		// Force the MigrationTool to instantiate in all cases.  The Quorum it uses must be loaded and running in
		// order to respond with accept ops, and without this call the MigrationTool won't be instantiated on the
		// summarizer client.
		await getDataStoreEntryPoint(runtime, migrationToolId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		return new InventoryListAppModel(
			await getDataStoreEntryPoint<IInventoryList>(runtime, inventoryListId),
			await getDataStoreEntryPoint<IMigrationTool>(runtime, migrationToolId),
			container,
		);
	}
}
