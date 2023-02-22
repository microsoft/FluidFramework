/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assertValidTaskData, TaskData } from "../src/model-interface";

/**
 * {@link TaskData} unit tests.
 */
describe("TaskData", () => {
	describe("assertValidTaskData", () => {
		it("Parses valid task data", () => {
			const input: TaskData = {
				42: {
					name: "The meaning of life",
					priority: 2,
				},
			};
			expect(() => assertValidTaskData(input)).not.toThrow();
		});

		it("Throws on invalid task data", () => {
			const input = "42:Determine meaning of life:37";
			expect(() => assertValidTaskData(input)).toThrow();
		});
	});
});
