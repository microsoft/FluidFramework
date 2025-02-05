/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { GroceryListPOJO } from "./groceryList/index.js";

/**
 * Simulating the case that we're making a network request to get suggestions for edits to the content,
 * as this is a likely scenario.  This is to force us to understand the implications of extracting the data
 * from Fluid, and later trying to merge suggestions back in (including scenarios where the Fluid content
 * has changed in the meantime).
 */
export const NETWORK_askHealthBotForSuggestions = async (
	groceryListString: string,
): Promise<string> => {
	const parsedGroceryList: GroceryListPOJO = JSON.parse(groceryListString);
	const improvedGroceryList: GroceryListPOJO = parsedGroceryList.filter(
		(item) => item.name.localeCompare("chocolate", "en", { sensitivity: "base" }) !== 0,
	);
	improvedGroceryList.push({ id: "newItem", name: "cauliflower" });

	return JSON.stringify(improvedGroceryList);
};
