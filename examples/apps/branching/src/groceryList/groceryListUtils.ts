/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IGroceryList } from "./interfaces.js";
import type {
	GroceryListItemPOJO,
	GroceryListPOJO,
	GroceryListModifications,
} from "./utilsInterfaces.js";

export const extractGroceryListPOJO = (groceryList: IGroceryList): string =>
	JSON.stringify(groceryList.getItems());

/**
 * Utilities for converting an IGroceryList to and from POJO for serialization and network request,
 * as well as working with the serialized format (e.g. diffing).
 */

export const diffGroceryListPOJO = (
	baseGroceryListPOJO: GroceryListPOJO,
	modifiedGroceryListPOJO: GroceryListPOJO,
): GroceryListModifications => {
	const removals: GroceryListItemPOJO[] = [];
	for (const maybeRemoval of baseGroceryListPOJO) {
		if (
			!modifiedGroceryListPOJO.find(
				(destinationItem) => destinationItem.id === maybeRemoval.id,
			)
		) {
			removals.push(maybeRemoval);
		}
	}

	const adds: GroceryListItemPOJO[] = [];
	for (const maybeAdd of modifiedGroceryListPOJO) {
		if (!baseGroceryListPOJO.find((sourceItem) => sourceItem.id === maybeAdd.id)) {
			adds.push(maybeAdd);
		}
	}

	return {
		adds,
		removals,
	};
};

export const applyDiffToGroceryList = (
	groceryList: IGroceryList,
	groceryListModifications: GroceryListModifications,
) => {
	for (const add of groceryListModifications.adds) {
		groceryList.addItem(add.name);
	}
	for (const removal of groceryListModifications.removals) {
		groceryList.removeItem(removal.id);
	}
};
