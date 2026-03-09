/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { CollaborativeTextContainerRuntimeFactory } from "../container.js";

describe("collaborative-textarea", () => {
	describe("CollaborativeTextContainerRuntimeFactory", () => {
		it("can be instantiated", () => {
			const factory = new CollaborativeTextContainerRuntimeFactory();
			assert.ok(factory !== undefined, "Expected factory to be defined");
		});

		it("is a constructor function", () => {
			assert.strictEqual(
				typeof CollaborativeTextContainerRuntimeFactory,
				"function",
				"Expected CollaborativeTextContainerRuntimeFactory to be a constructor",
			);
		});
	});
});
