/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Grocery, GroceryList } from "../domains/index.js";
import { scoreSymbol, type LLMIntegrationTest, type ScorableVerboseTree } from "../utils.js";

const alphabeticalGroceries = [
	{ name: "Apples", price: 1.49, purchased: false },
	{ name: "Bananas", price: 0.79, purchased: false },
	{ name: "Carrots", price: 1.09, purchased: false },
	{ name: "Dill", price: 2.49, purchased: false },
	{ name: "Eggs", price: 3.39, purchased: false },
	{ name: "Flour", price: 2.89, purchased: false },
	{ name: "Grapes", price: 2.69, purchased: false },
	{ name: "Honey", price: 6.99, purchased: false },
	{ name: "Iceberg Lettuce", price: 1.79, purchased: false },
	{ name: "Jam", price: 4.59, purchased: false },
] as const;

const priceSortedGroceries = [...alphabeticalGroceries].sort((a, b) => a.price - b.price);

const expected: ScorableVerboseTree = {
	[scoreSymbol]: (actual): number => {
		if (typeof actual !== "object" || actual === null || !Array.isArray(actual.fields)) {
			return 0;
		}
		if (actual.fields.length !== priceSortedGroceries.length) {
			return 0;
		}
		for (let index = 0; index < actual.fields.length; index++) {
			const node = actual.fields[index];
			const expectedItem = priceSortedGroceries[index];
			if (expectedItem === undefined) {
				return 0;
			}
			if (typeof node !== "object" || node === null || Array.isArray(node.fields)) {
				return 0;
			}
			if (node.type !== "com.microsoft.fluid.tree-agent.groceries.Grocery") {
				return 0;
			}
			const nodeFields = node.fields;
			if (typeof nodeFields !== "object" || nodeFields === null || Array.isArray(nodeFields)) {
				return 0;
			}
			if (nodeFields.name !== expectedItem.name) {
				return 0;
			}
			if (
				typeof nodeFields.price !== "number" ||
				Math.abs(nodeFields.price - expectedItem.price) > 1e-9
			) {
				return 0;
			}
			if (nodeFields.purchased !== expectedItem.purchased) {
				return 0;
			}
		}
		return 1;
	},
};

/**
 * Requests the LLM to sort groceries by price.
 */
export const sortGroceriesTest = {
	name: "Sort groceries by price",
	schema: GroceryList,
	initialTree: () => alphabeticalGroceries.map((item) => new Grocery(item)),
	prompt: "Please sort the groceries array by price from lowest to highest.",
	expected,
	options: {
		domainHints: "You manage a grocery list to help a user with his or her shopping.",
	},
} as const satisfies LLMIntegrationTest<typeof GroceryList>;
