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
	const stringifiedOriginal = extractGroceryListPOJO(groceryList);
	const pojoOriginal: GroceryListPOJO = JSON.parse(stringifiedOriginal);
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
