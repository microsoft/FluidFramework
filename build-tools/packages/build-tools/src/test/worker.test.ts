/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import { describe, it } from "mocha";
import { serializeWorkerError } from "../fluidBuild/tasks/workers/workerError.js";

describe("serializeWorkerError", () => {
	it("serializes Error fields", () => {
		const error = new Error("boom");

		assert.deepEqual(serializeWorkerError(error), {
			name: "Error",
			message: "boom",
			stack: error.stack,
		});
	});

	it("ignores primitive and nullish thrown values", () => {
		assert.deepEqual(serializeWorkerError("boom"), {});
		assert.deepEqual(serializeWorkerError(null), {});
		assert.deepEqual(serializeWorkerError(undefined), {});
	});

	it("ignores non-string error fields", () => {
		assert.deepEqual(
			serializeWorkerError({
				name: 123,
				message: {},
				stack: undefined,
			}),
			{
				name: undefined,
				message: undefined,
				stack: undefined,
			},
		);
	});
});
