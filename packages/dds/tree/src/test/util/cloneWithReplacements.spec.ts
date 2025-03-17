/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { cloneWithReplacements } from "../../util/index.js";

describe("cloneWithReplacements", () => {
	it("deep clone", () => {
		const data = { a: 1, b: { c: null }, d: "s", e: [1, 2] };
		const clone = cloneWithReplacements(data, "root", (key, value) => ({
			clone: true,
			value,
		})) as typeof data;
		assert.notEqual(clone, data);
		assert.notEqual(clone.b, data.b);
		assert.notEqual(clone.e, data.e);
		assert.deepEqual(clone, data);
	});

	it("clone: false", () => {
		const data = { b: { c: null } };

		{
			const log: unknown[] = [];
			const clone = cloneWithReplacements(data, "X", (key, value) => {
				log.push([key, value]);
				return {
					clone: false,
					value,
				};
			}) as typeof data;
			assert.equal(clone, data);
			assert.deepEqual(log, [["X", data]]);
		}

		{
			const log: unknown[] = [];
			const clone = cloneWithReplacements(data, "X", (key, value) => {
				log.push([key, value]);
				return {
					clone: key === "X",
					value,
				};
			}) as typeof data;
			assert.notEqual(clone, data);
			assert.equal(clone.b, data.b);
			assert.deepEqual(clone, data);
			assert.deepEqual(log, [
				["X", data],
				["b", data.b],
			]);
		}
	});
});
