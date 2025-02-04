/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getDataStoreEntryPoint } from "@fluid-example/example-utils";
import type {
	IContainerContext,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/legacy";
import { loadContainerRuntime } from "@fluidframework/container-runtime/legacy";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";
import type { FluidObject } from "@fluidframework/core-interfaces";

import { GroceryListFactory } from "./groceryList/index.js";

const groceryListId = "grocery-list";
const groceryListRegistryKey = "grocery-list";
const groceryListFactory = new GroceryListFactory();

export class GroceryListContainerRuntimeFactory implements IRuntimeFactory {
	public get IRuntimeFactory(): IRuntimeFactory {
		return this;
	}

	public async instantiateRuntime(
		context: IContainerContext,
		existing: boolean,
	): Promise<IRuntime> {
		const provideEntryPoint = async (
			containerRuntime: IContainerRuntime,
		): Promise<FluidObject> => getDataStoreEntryPoint(containerRuntime, groceryListId);

		const runtime = await loadContainerRuntime({
			context,
			registryEntries: new Map([
				[groceryListRegistryKey, Promise.resolve(groceryListFactory)],
			]),
			provideEntryPoint,
			existing,
		});

		if (!existing) {
			const groceryList = await runtime.createDataStore(groceryListRegistryKey);
			await groceryList.trySetAlias(groceryListId);
		}

		return runtime;
	}
}
