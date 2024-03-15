/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IMigrationTool } from "@fluid-example/example-utils";
import {
	MigrationToolInstantiationFactory,
	ModelContainerRuntimeFactory,
	getDataStoreEntryPoint,
} from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions";

import type { IInventoryList, IInventoryListAppModel } from "../modelInterfaces.js";
import { InventoryListAppModel } from "./appModel.js";
import { InventoryListInstantiationFactory } from "./inventoryList.js";

export const inventoryListId = "default-inventory-list";
export const migrationToolId = "migration-tool";

export class InventoryListContainerRuntimeFactory extends ModelContainerRuntimeFactory<IInventoryListAppModel> {
	/**
	 * Constructor for the factory. Supports a test mode which spawns the summarizer instantly.
	 * @param testMode - True to enable instant summarizer spawning.
	 */
	public constructor(testMode: boolean) {
		super(
			new Map([
				InventoryListInstantiationFactory.registryEntry,
				MigrationToolInstantiationFactory.registryEntry,
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
		const inventoryList = await runtime.createDataStore(InventoryListInstantiationFactory.type);
		await inventoryList.trySetAlias(inventoryListId);
		const migrationTool = await runtime.createDataStore(MigrationToolInstantiationFactory.type);
		await migrationTool.trySetAlias(migrationToolId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerHasInitialized}
	 */
	protected async containerHasInitialized(runtime: IContainerRuntime) {
		console.info("Using runtime factory version two");
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
