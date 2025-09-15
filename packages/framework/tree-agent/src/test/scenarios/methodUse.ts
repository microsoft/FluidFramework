/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UserWithMethods } from "../domains/index.js";
import type { LLMIntegrationTest, ScorableVerboseTree } from "../utils.js";

const expected: ScorableVerboseTree = {
	type: "com.microsoft.fluid.tree-agent.usersWithMethods.User",
	// [scoreSymbol]: (actual): number => {
	// 	if (typeof actual !== "object" || actual === null || Array.isArray(actual.fields)) {
	// 		return 0;
	// 	}

	// 	return actual.displayName === "alvillarreal" ? 1 : 0;
	// 	// Penalize if there are more than 4 users (encourage precision)
	// 	const actualKeys = Object.keys(actual.fields);
	// 	if (actualKeys.length > required.size) {
	// 		// simple linear penalty
	// 		score *= required.size / actualKeys.length;
	// 	}
	// 	return score;
	// },
};

/**
 * TODO
 */
export const methodUseTest = {
	name: "Method use",
	schema: UserWithMethods,
	initialTree: () => ({ firstName: "alejandro", lastName: "villarreal" }),
	prompt: "Update the user's display name.",
	expected,
	// options: {
	// 	treeToString: stringifySmoke,
	// },
} as const satisfies LLMIntegrationTest<typeof UserWithMethods>;
