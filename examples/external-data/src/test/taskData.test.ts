/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { type ITaskData, assertValidTaskData } from "../model-interface/index.js";

/**
 * {@link ITaskData} unit tests.
 */
describe("ITaskData", () => {
	describe("assertValidTaskData", () => {
		it("Parses valid task data", () => {
			const input: ITaskData = {
				42: {
					name: "The meaning of life",
					priority: 2,
				},
			};
			assert.doesNotThrow(() => assertValidTaskData(input));
		});

		it("Throws on invalid task data", () => {
			const input = "42:Determine meaning of life:37";
			assert.throws(() => assertValidTaskData(input));
		});
	});
});
