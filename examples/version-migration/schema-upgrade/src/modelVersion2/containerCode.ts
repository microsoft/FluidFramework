/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ModelContainerRuntimeFactory,
	getDataStoreEntryPoint,
} from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";

import type { IInventoryList, IInventoryListAppModel } from "../modelInterfaces.js";

import { InventoryListAppModel } from "./appModel.js";
import { InventoryListInstantiationFactory } from "./inventoryList.js";

const inventoryListId = "default-inventory-list";

export class InventoryListContainerRuntimeFactory extends ModelContainerRuntimeFactory<IInventoryListAppModel> {
	/**
	 * Constructor for the factory. Supports a test mode which spawns the summarizer instantly.
	 * @param testMode - True to enable instant summarizer spawning.
	 */
	public constructor(testMode: boolean) {
		super(
			new Map([InventoryListInstantiationFactory.registryEntry]), // registryEntries
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
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		return new InventoryListAppModel(
			await getDataStoreEntryPoint<IInventoryList>(runtime, inventoryListId),
			container,
		);
	}
}
