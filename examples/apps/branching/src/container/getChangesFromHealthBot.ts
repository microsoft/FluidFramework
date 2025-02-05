/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NETWORK_askHealthBotForSuggestions } from "../healthBot.js";

import {
	diffGroceryListPOJO,
	extractGroceryListPOJO,
	type GroceryListChanges,
	type GroceryListPOJO,
	type IGroceryList,
} from "./groceryList/index.js";

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
