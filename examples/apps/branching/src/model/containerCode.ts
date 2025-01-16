/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ModelContainerRuntimeFactory,
	getDataStoreEntryPoint,
} from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions/legacy";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";

import type { IGroceryList, IGroceryListAppModel } from "../modelInterfaces.js";

import { GroceryListAppModel } from "./appModel.js";
import { GroceryListFactory } from "./groceryList.js";

export const newTreeInventoryListId = "new-tree-inventory-list";

/**
 * @internal
 */
export class GroceryListContainerRuntimeFactory extends ModelContainerRuntimeFactory<IGroceryListAppModel> {
	public constructor() {
		super(
			new Map([GroceryListFactory.registryEntry]), // registryEntries
			{ enableRuntimeIdCompressor: "on" },
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const newTreeInventoryList = await runtime.createDataStore(GroceryListFactory.type);
		await newTreeInventoryList.trySetAlias(newTreeInventoryListId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		const newTreeInventoryList = await getDataStoreEntryPoint<IGroceryList>(
			runtime,
			newTreeInventoryListId,
		);
		return new GroceryListAppModel(newTreeInventoryList);
	}
}
