/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Grocery } from "../domains/index.js";
import { scoreSymbol, type LLMIntegrationTest, type ScorableVerboseTree } from "../utils.js";

import {
	alphabeticalGroceries,
	buildAlphabeticalLinkedGroceries,
	verifyLinkedGroceries,
} from "./linkedGroceriesTestData.js";

const priceSortedGroceries = [...alphabeticalGroceries].sort((a, b) => a.price - b.price);

const expected: ScorableVerboseTree = {
	type: "com.microsoft.fluid.tree-agent.groceries.Grocery",
	[scoreSymbol]: (actual): number =>
		verifyLinkedGroceries(actual, priceSortedGroceries) ? 1 : 0,
};

/**
 * Requests the LLM to sort a linked list of groceries by price.
 */
export const sortLinkedGroceriesTest = {
	name: "Sort linked groceries by price",
	schema: Grocery,
	initialTree: () => buildAlphabeticalLinkedGroceries(),
	prompt: "Please sort the linked groceries by price from lowest to highest.",
	expected,
	options: {
		domainHints: "You manage a grocery list to help a user with his or her shopping.",
	},
} as const satisfies LLMIntegrationTest<typeof Grocery>;
