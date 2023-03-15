/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assertValidTaskList, TaskList } from "../src/model-interface";

/**
 * {@link TaskList} unit tests.
 */
describe("TaskList", () => {
	describe("assertValidTaskList", () => {
		it("Parses valid task data", () => {
			const input: TaskList = {
				42: {
					name: "The meaning of life",
					priority: 2,
				},
			};
			expect(() => assertValidTaskList(input)).not.toThrow();
		});

		it("Throws on invalid task data", () => {
			const input = "42:Determine meaning of life:37";
			expect(() => assertValidTaskList(input)).toThrow();
		});
	});
});
