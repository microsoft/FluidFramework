/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { computeSync } from "../plain/plainUtils.js";

describe("plainUtils", () => {
	describe("computeSync", () => {
		/**
		 * Calls computeSync, applies the returned ops to a copy of `existing`,
		 * asserts the result equals `final`, and returns the ops for further assertions.
		 */
		function computeSyncAndValidate<T>(
			existing: readonly T[],
			final: readonly T[],
		): ReturnType<typeof computeSync<T>> {
			const ops = computeSync(existing, final);
			const result = [...existing];
			if (ops.remove) {
				result.splice(ops.remove.start, ops.remove.end - ops.remove.start);
			}
			if (ops.insert) {
				result.splice(ops.insert.location, 0, ...ops.insert.slice);
			}
			assert.deepEqual(result, [...final]);
			return ops;
		}

		it("works for two empty arrays", () => {
			computeSyncAndValidate([], []);
		});

		it("returns no ops for identical arrays", () => {
			const ops = computeSyncAndValidate(["a", "b", "c"], ["a", "b", "c"]);
			assert.equal(ops.remove, undefined);
			assert.equal(ops.insert, undefined);
		});

		it("inserts all elements when existing is empty", () => {
			computeSyncAndValidate([], ["a", "b", "c"]);
		});

		it("removes all elements when final is empty", () => {
			computeSyncAndValidate(["a", "b", "c"], []);
		});

		it("replaces all elements when arrays are completely different", () => {
			computeSyncAndValidate(["a", "b"], ["c", "d"]);
		});

		it("appends element to end", () => {
			const ops = computeSyncAndValidate(["a", "b"], ["a", "b", "c"]);
			assert.equal(ops.remove, undefined);
		});

		it("removes element from end", () => {
			const ops = computeSyncAndValidate(["a", "b", "c"], ["a", "b"]);
			assert.equal(ops.insert, undefined);
		});

		it("prepends element at start", () => {
			const ops = computeSyncAndValidate(["b", "c"], ["a", "b", "c"]);
			assert.equal(ops.remove, undefined);
		});

		it("removes element from start", () => {
			const ops = computeSyncAndValidate(["a", "b", "c"], ["b", "c"]);
			assert.equal(ops.insert, undefined);
		});

		it("replaces middle section", () => {
			const ops = computeSyncAndValidate(["a", "b", "c", "d"], ["a", "x", "y", "d"]);
			assert.deepEqual(ops.remove, { start: 1, end: 3 });
			assert.deepEqual(ops.insert, { location: 1, slice: ["x", "y"] });
		});

		it("inserts into the middle of an existing array", () => {
			const ops = computeSyncAndValidate(["a", "d"], ["a", "b", "c", "d"]);
			assert.equal(ops.remove, undefined);
		});

		it("removes from the middle of an existing array", () => {
			const ops = computeSyncAndValidate(["a", "b", "c", "d"], ["a", "d"]);
			assert.equal(ops.insert, undefined);
		});
	});
});
