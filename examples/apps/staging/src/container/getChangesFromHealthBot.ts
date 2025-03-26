/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NETWORK_askHealthBotForSuggestions } from "../healthBot.js";

import type { IGroceryList } from "./groceryList/index.js";
import type {
	GroceryListChanges,
	GroceryListItemPOJO,
	GroceryListPOJO,
} from "./interfaces.js";

const extractGroceryListPOJO = (groceryList: IGroceryList): GroceryListPOJO =>
	groceryList.getItems();

const diffGroceryListPOJO = (
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

export const getChangesFromHealthBot = async (
	groceryList: IGroceryList,
): Promise<GroceryListChanges> => {
	const pojoOriginal = extractGroceryListPOJO(groceryList);
	// Here I'm pretending the network service expects JSON.  Some other format could be used instead.
	const stringifiedOriginal = JSON.stringify(pojoOriginal);
	const stringifiedSuggestions = await NETWORK_askHealthBotForSuggestions(stringifiedOriginal);
	const pojoSuggestions: GroceryListPOJO = JSON.parse(stringifiedSuggestions);
	const changes = diffGroceryListPOJO(pojoOriginal, pojoSuggestions);
	console.log(
		"Suggestions:",
		pojoSuggestions,
		"\nAdds:",
		changes.adds,
		"\nRemovals:",
		changes.removals,
	);
	return changes;
};
