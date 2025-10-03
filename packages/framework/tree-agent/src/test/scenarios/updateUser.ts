/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../../utils.js";
import { Users } from "../domains/index.js";
import { scoreSymbol, type LLMIntegrationTest, type ScorableVerboseTree } from "../utils.js";

// We start with two users (alpardes and mapardes) and edit the alpardes user.
// We only score on the presence of the two correct user IDs and their name fields; timestamps/emails are ignored.
const expected: ScorableVerboseTree = {
	type: "com.microsoft.fluid.tree-agent.users.Users",
	[scoreSymbol]: (actual): number => {
		if (typeof actual !== "object" || actual === null || Array.isArray(actual.fields)) {
			return 0;
		}
		const required = new Map<string, { firstName: string; lastName: string; email?: string }>([
			[
				"alpardes",
				{ firstName: "Alexander", lastName: "Pardes", email: "pardesio@gmail.com" },
			],
			["rymagani", { firstName: "Ryan", lastName: "Magani", email: "ringom@gmail.com" }],
		]);
		let score = 1;
		for (const [id, { firstName, lastName }] of required) {
			const user = actual.fields[id];
			if (
				typeof user !== "object" ||
				user === null ||
				Array.isArray(user.fields) ||
				user.type !== "com.microsoft.fluid.tree-agent.users.User"
			) {
				score -= 1 / required.size;
				continue;
			}
			if (
				typeof user.fields.firstName !== "string" ||
				user.fields.firstName.toLowerCase() !== firstName.toLowerCase()
			) {
				score -= 1 / required.size;
				continue;
			}
			if (
				typeof user.fields.lastName !== "string" ||
				user.fields.lastName.toLowerCase() !== lastName.toLowerCase()
			) {
				score -= 1 / required.size;
				continue;
			}
		}
		// Penalize if there are more than 4 users (encourage precision)
		const actualKeys = Object.keys(actual.fields);
		if (actualKeys.length > required.size) {
			// simple linear penalty
			score *= required.size / actualKeys.length;
		}
		return score;
	},
};

/**
 * Scenario: Update a user in an existing set of users. Only the user subtree is passed to the LLM.
 */
export const updateUserTest = {
	name: "Update user",
	schema: Users,
	initialTree: () => ({
		alpardes: {
			firstName: "Alex",
			lastName: "Pardes",
			created: "2024-01-01T00:00:00.000Z",
			email: "pardesio@gmail.com",
		},
		rymagani: {
			firstName: "Ryan",
			lastName: "Magani",
			created: "2024-02-01T00:00:00.000Z",
			email: "ringom@gmail.com",
		},
	}),
	prompt: "Please update Alex's name to Alexander",
	expected,
	options: {
		subtree: (root) => root.get("alpardes") ?? fail("Expected user not found."),
	},
} as const satisfies LLMIntegrationTest<typeof Users>;
