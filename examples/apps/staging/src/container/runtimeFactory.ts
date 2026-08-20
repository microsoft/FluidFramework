/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	exampleOldestSupportedClient,
	getDataStoreEntryPoint,
} from "@fluid-example/example-utils";
import type {
	IContainerContext,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/legacy";
// eslint-disable-next-line import-x/no-deprecated -- only the minVersionForCollab overload is deprecated.
import { loadContainerRuntime } from "@fluidframework/container-runtime/legacy";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/legacy";

import { GroceryListFactory, type IGroceryList } from "./groceryList/index.js";
import type { ISuggestionGroceryList } from "./interfaces.js";
import { SuggestionGroceryList } from "./suggestionGroceryList.js";

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
		): Promise<ISuggestionGroceryList> => {
			const groceryList = await getDataStoreEntryPoint<IGroceryList>(
				containerRuntime,
				groceryListId,
			);
			// TODO: Here we could pass in the capability to enter staging mode if it lives on the containerRuntime.
			return new SuggestionGroceryList(groceryList);
		};

		// eslint-disable-next-line import-x/no-deprecated -- using the canonical overload.
		const runtime = await loadContainerRuntime({
			context,
			registryEntries: new Map([
				[groceryListRegistryKey, Promise.resolve(groceryListFactory)],
			]),
			provideEntryPoint,
			existing,
			oldestSupportedClient: exampleOldestSupportedClient,
		});

		if (!existing) {
			const groceryList = await runtime.createDataStore(groceryListRegistryKey);
			await groceryList.trySetAlias(groceryListId);
		}

		return runtime;
	}
}
