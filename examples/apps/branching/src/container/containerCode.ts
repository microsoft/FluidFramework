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

import { getChangesFromHealthBot } from "./getChangesFromHealthBot.js";
import {
	applyDiffToGroceryList,
	GroceryListFactory,
	type GroceryListChanges,
	type IGroceryList,
} from "./groceryList/index.js";

const groceryListId = "grocery-list";
const groceryListRegistryKey = "grocery-list";
const groceryListFactory = new GroceryListFactory();

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type PrivateChanges = {
	readonly changes: GroceryListChanges;
	readonly acceptChanges: () => void;
	readonly rejectChanges: () => void;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type GroceryListAppEntryPoint = {
	readonly groceryList: IGroceryList;
	readonly getSuggestions: () => Promise<PrivateChanges>;
};

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
		): Promise<FluidObject> => {
			const groceryList = await getDataStoreEntryPoint<IGroceryList>(
				containerRuntime,
				groceryListId,
			);
			const getSuggestions = async () => {
				const changes = await getChangesFromHealthBot(groceryList);
				return {
					changes,
					acceptChanges: () => applyDiffToGroceryList(groceryList, changes),
					rejectChanges: () => {},
				};
			};
			return {
				groceryList,
				getSuggestions,
			};
		};

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
