/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	GroceryListItemPOJO,
	GroceryListPOJO,
	GroceryListModifications,
	IGroceryList,
} from "./interfaces.js";

export const diffGroceryListJSON = (
	baseGroceryListJSON: GroceryListPOJO,
	modifiedGroceryListJSON: GroceryListPOJO,
): GroceryListModifications => {
	const removals: GroceryListItemPOJO[] = [];
	for (const maybeRemoval of baseGroceryListJSON) {
		if (
			!modifiedGroceryListJSON.find(
				(destinationItem) => destinationItem.id === maybeRemoval.id,
			)
		) {
			removals.push(maybeRemoval);
		}
	}

	const adds: GroceryListItemPOJO[] = [];
	for (const maybeAdd of modifiedGroceryListJSON) {
		if (!baseGroceryListJSON.find((sourceItem) => sourceItem.id === maybeAdd.id)) {
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
	groceryListJSONDiff: GroceryListModifications,
) => {
	for (const add of groceryListJSONDiff.adds) {
		groceryList.addItem(add.name);
	}
	for (const removal of groceryListJSONDiff.removals) {
		groceryList.removeItem(removal.id);
	}
};
