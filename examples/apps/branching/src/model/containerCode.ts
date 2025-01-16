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

export const groceryListId = "grocery-list";

const groceryListRegistryKey = "grocery-list";
const groceryListFactory = new GroceryListFactory();

/**
 * @internal
 */
export class GroceryListContainerRuntimeFactory extends ModelContainerRuntimeFactory<IGroceryListAppModel> {
	public constructor() {
		super(
			new Map([[groceryListRegistryKey, Promise.resolve(groceryListFactory)]]), // registryEntries
		);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const groceryList = await runtime.createDataStore(groceryListRegistryKey);
		await groceryList.trySetAlias(groceryListId);
	}

	/**
	 * {@inheritDoc ModelContainerRuntimeFactory.createModel}
	 */
	protected async createModel(runtime: IContainerRuntime, container: IContainer) {
		const newTreeInventoryList = await getDataStoreEntryPoint<IGroceryList>(
			runtime,
			groceryListId,
		);
		return new GroceryListAppModel(newTreeInventoryList);
	}
}
