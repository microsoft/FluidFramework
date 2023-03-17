/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assertValidTaskData, ITaskData } from "../src/model-interface";

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
			expect(() => assertValidTaskData(input)).not.toThrow();
		});

		it("Throws on invalid task data", () => {
			const input = "42:Determine meaning of life:37";
			expect(() => assertValidTaskData(input)).toThrow();
		});
	});
});
