/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISameContainerMigrationTool } from "@fluid-example/example-utils";
import {
	ModelContainerRuntimeFactory,
	SameContainerMigrationToolInstantiationFactory,
} from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
// eslint-disable-next-line import/no-deprecated
import { requestFluidObject } from "@fluidframework/runtime-utils";

import type { IInventoryList, IInventoryListAppModel } from "../modelInterfaces";
import { InventoryListAppModel } from "./appModel";
import { InventoryListInstantiationFactory } from "./inventoryList";

export const inventoryListId = "default-inventory-list";
export const migrationToolId = "migration-tool";

export class InventoryListContainerRuntimeFactory extends ModelContainerRuntimeFactory<IInventoryListAppModel> {
	/**
	 * Constructor for the factory. Supports a test mode which spawns the summarizer instantly.
	 * @param testMode - True to enable instant summarizer spawning.
	 */
	public constructor() {
		super(
			new Map([
				InventoryListInstantiationFactory.registryEntry,
				SameContainerMigrationToolInstantiationFactory.registryEntry,
			]), // registryEntries
			{
				summaryOptions: {
					summaryConfigOverrides: {
						state: "disableHeuristics",
						maxAckWaitTime: 10000,
						maxOpsSinceLastSummary: 7000,
						initialSummarizerDelayMs: 0,
					},
				},
			},
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const inventoryList = await runtime.createDataStore(InventoryListInstantiationFactory.type);
		await inventoryList.trySetAlias(inventoryListId);
		const migrationTool = await runtime.createDataStore(
			SameContainerMigrationToolInstantiationFactory.type,
		);
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
		// eslint-disable-next-line import/no-deprecated
		await requestFluidObject(await runtime.getRootDataStore(migrationToolId), "");
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		// TODO: remove, just for debugging purposes
		// eslint-disable-next-line @typescript-eslint/dot-notation
		window["interactiveContainer"] ??= container;

		// eslint-disable-next-line import/no-deprecated
		const inventoryList = await requestFluidObject<IInventoryList>(
			await runtime.getRootDataStore(inventoryListId),
			"",
		);
		// eslint-disable-next-line import/no-deprecated
		const migrationTool = await requestFluidObject<ISameContainerMigrationTool>(
			await runtime.getRootDataStore(migrationToolId),
			"",
		);
		return new InventoryListAppModel(inventoryList, migrationTool, container, runtime);
	}
}
