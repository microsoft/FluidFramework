/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { GroceryListJSON } from "./modelInterfaces.js";

export const NETWORK_askHealthBotForSuggestions = async (
	groceryListJSONString: string,
): Promise<string> => {
	const parsedGroceryList: GroceryListJSON = JSON.parse(groceryListJSONString);
	const improvedGroceryList: GroceryListJSON = parsedGroceryList.filter(
		(item) => item.name.localeCompare("chocolate", "en", { sensitivity: "base" }) !== 0,
	);
	improvedGroceryList.push({ id: "newItem", name: "cauliflower" });

	return JSON.stringify(improvedGroceryList);
};
