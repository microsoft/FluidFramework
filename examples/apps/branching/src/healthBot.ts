/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IGroceryList } from "./modelInterfaces.js";

export const askHealthBotForSuggestions = async (groceryList: IGroceryList) => {
	for (const item of groceryList.getItems()) {
		if (item.name === "chocolate") {
			item.deleteItem();
		}
	}
	groceryList.addItem("cauliflower");
};
