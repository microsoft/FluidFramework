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
	/**
	 * A catalog of the changes that will be applied if acceptChanges is called.
	 */
	readonly changes: GroceryListChanges;
	/**
	 * Apply the changes to the grocery list.
	 */
	readonly acceptChanges: () => void;
	/**
	 * Drop the changes and return to the original grocery list.
	 */
	readonly rejectChanges: () => void;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type GroceryListAppEntryPoint = {
	readonly groceryList: IGroceryList;
	/**
	 * Requests a service to provide suggested changes in a private state (not actually applied to
	 * the collaborative data yet).  The PrivateChanges can be reviewed, and then accepted or rejected.
	 */
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
				// TODO: Here try integrating staging mode and applying the changes in that mode.
				// TODO: If we end up providing a way to interrogate local changes, maybe replace the `changes` structure.
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
