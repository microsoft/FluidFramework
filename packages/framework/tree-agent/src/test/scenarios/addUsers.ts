/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Users } from "../domains/index.js";
import { scoreSymbol, type LLMIntegrationTest, type ScorableVerboseTree } from "../utils.js";

// We start with two users (alpardes and mapardes) and add two more (jodoe and ansmith).
// We only score on the presence of the four correct user IDs and their name fields; timestamps/emails are ignored.
const expected: ScorableVerboseTree = {
	type: "com.microsoft.fluid.tree-agent.users.Users",
	[scoreSymbol]: (actual): number => {
		if (typeof actual !== "object" || actual === null || Array.isArray(actual.fields)) {
			return 0;
		}
		const required = new Map<string, string>([
			["alpardes", "Alex Pardes"],
			["rymagani", "Ryan Magani"],
			["tawilliams", "Taylor Williams"],
			["chdog", "Chewy Dog"],
		]);
		let score = 1;
		for (const [id, name] of required) {
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
				typeof user.fields.name !== "string" ||
				user.fields.name.toLowerCase() !== name.toLowerCase()
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
 * Scenario: Add two new users to an existing set of users.
 */
export const addUsersTest = {
	name: "Add users",
	schema: Users,
	initialTree: () => ({
		alpardes: {
			name: "Alex Pardes",
			created: "2024-01-01T00:00:00.000Z",
			email: "pardesio@gmail.com",
		},
		rymagani: {
			name: "Ryan Magani",
			created: "2024-02-01T00:00:00.000Z",
			email: "ringom@gmail.com",
		},
	}),
	prompt: "Please add two new users to this database: Taylor Williams and Chewy Dog.",
	expected,
} as const satisfies LLMIntegrationTest<typeof Users>;
