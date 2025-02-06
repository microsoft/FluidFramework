/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	GroceryListItemPOJO,
	GroceryListPOJO,
	GroceryListChanges,
	IGroceryList,
} from "./interfaces.js";

/**
 * Utilities for converting an IGroceryList to and from POJO for serialization and network request,
 * as well as working with the serialized format (e.g. diffing).
 */

export const extractGroceryListPOJO = (groceryList: IGroceryList): GroceryListPOJO =>
	groceryList.getItems();

export const diffGroceryListPOJO = (
	baseGroceryListPOJO: GroceryListPOJO,
	modifiedGroceryListPOJO: GroceryListPOJO,
): GroceryListChanges => {
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
	groceryListChanges: GroceryListChanges,
) => {
	for (const add of groceryListChanges.adds) {
		// TODO: Probably shouldn't do this as a side-effect, I might want to retain the original
		// suggestions unmodified.
		add.id = groceryList.addItem(add.name);
	}
	for (const removal of groceryListChanges.removals) {
		groceryList.removeItem(removal.id);
	}
};
