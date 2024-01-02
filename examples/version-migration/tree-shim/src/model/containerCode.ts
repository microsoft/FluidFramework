/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory, getDataStoreEntryPoint } from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions";

import type { IInventoryListAppModel } from "../modelInterfaces";
import { InventoryListAppModel } from "./appModel";
import { InventoryList, InventoryListFactory } from "./inventoryList";

export const inventoryListId = "inventory-list";

/**
 * @internal
 */
export class InventoryListContainerRuntimeFactory extends ModelContainerRuntimeFactory<IInventoryListAppModel> {
	public constructor() {
		super(
			new Map([InventoryListFactory.registryEntry]), // registryEntries
			{ enableRuntimeIdCompressor: true },
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const inventoryList = await runtime.createDataStore(InventoryListFactory.type);
		await inventoryList.trySetAlias(inventoryListId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		const inventoryList = await getDataStoreEntryPoint<InventoryList>(runtime, inventoryListId);
		return new InventoryListAppModel(inventoryList);
	}
}
