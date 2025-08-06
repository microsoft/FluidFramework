/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Smoke, stringifySmoke } from "../domains/index.js";
import type { LLMIntegrationTest, ScorableVerboseTree } from "../utils.js";

const expectedText: ScorableVerboseTree = {
	type: "com.microsoft.fluid.tree-agent.smoke.Smoke",
	fields: {
		color: "white",
	},
};

/**
 * TODO
 */
export const smokeTest = {
	name: "Smoke test",
	schema: Smoke,
	initialTree: () => ({ color: "black" }),
	prompt: "A new pope has been elected. Please update the color of the smoke!",
	expected: expectedText,
	options: {
		treeToString: stringifySmoke,
	},
} as const satisfies LLMIntegrationTest<typeof Smoke>;
