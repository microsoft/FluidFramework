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

const removedItemName = "Honey";
const expectedGroceries = alphabeticalGroceries.filter(
	(item) => item.name !== removedItemName,
);

const expected: ScorableVerboseTree = {
	type: "com.microsoft.fluid.tree-agent.groceries.Grocery",
	[scoreSymbol]: (actual): number =>
		verifyLinkedGroceries(actual, expectedGroceries) ? 1 : 0,
};

/**
 * Requests the LLM to remove a grocery item from the middle of the linked list.
 */
export const unlinkLinkedGroceriesTest = {
	name: "Remove a grocery from the linked list",
	schema: Grocery,
	initialTree: () => buildAlphabeticalLinkedGroceries(),
	prompt: `Please remove "${removedItemName}".`,
	expected,
	options: {
		domainHints: "You manage a grocery list to help a user with his or her shopping.",
	},
} as const satisfies LLMIntegrationTest<typeof Grocery>;
