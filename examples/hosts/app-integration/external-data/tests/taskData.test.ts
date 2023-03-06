/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assertValidTaskListData, TaskListData } from "../src/model-interface";

/**
 * {@link TaskListData} unit tests.
 */
describe("TaskListData", () => {
	describe("assertValidTaskListData", () => {
		it("Parses valid task data", () => {
			const input: TaskListData = {
				"1": {
					"42": {
						name: "The meaning of life",
						priority: 2,
					},
				},
			};
			expect(() => assertValidTaskListData(input)).not.toThrow();
		});

		it("Throws on invalid task data", () => {
			const input = "42:Determine meaning of life:37";
			expect(() => assertValidTaskListData(input)).toThrow();
		});
	});
});
