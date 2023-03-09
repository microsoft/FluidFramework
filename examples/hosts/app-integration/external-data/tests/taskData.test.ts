/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assertValidTaskListExternalModel, TaskListExternalModel } from "../src/model-interface";

/**
 * {@link TaskListExternalModel} unit tests.
 */
describe("TaskListExternalModel", () => {
	describe("assertValidTaskListExternalModel", () => {
		it("Parses valid task data", () => {
			const input: TaskListExternalModel = {
				"42": {
					name: "The meaning of life",
					priority: 2,
				},
			};
			expect(() => assertValidTaskListExternalModel(input)).not.toThrow();
		});

		it("Throws on invalid task data", () => {
			const input = "42:Determine meaning of life:37";
			expect(() => assertValidTaskListExternalModel(input)).toThrow();
		});
	});
});
