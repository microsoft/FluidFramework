/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { cloneWithReplacements, deepClone } from "../../util/index.js";

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

	describe("deepClone", () => {
		it("copies nested objects and arrays without sharing references", () => {
			const entry = { value: 1 };
			const data = {
				nested: { value: "original" },
				entries: [entry],
				empty: null,
				missing: undefined,
			};
			const clone = deepClone(data);
			const clonedEntry = clone.entries[0];
			assert(clonedEntry !== undefined);
			assert.deepEqual(clone, data);
			assert.notEqual(clone, data);
			assert.notEqual(clone.nested, data.nested);
			assert.notEqual(clone.entries, data.entries);
			assert.notEqual(clonedEntry, entry);

			clone.nested.value = "changed";
			clonedEntry.value = 2;
			clone.entries.push({ value: 3 });
			assert.equal(data.nested.value, "original");
			assert.equal(entry.value, 1);
			assert.equal(data.entries.length, 1);

			entry.value = 4;
			assert.equal(clonedEntry.value, 2);
		});

		it("returns primitive values unchanged", () => {
			for (const value of [undefined, null, false, true, 0, 42, "text"] as const) {
				assert.equal(deepClone(value), value);
			}
		});

		it('preserves "__proto__" as an own data property', () => {
			const data = { ["__proto__"]: { value: 1 } };
			const clone = deepClone(data);
			assert.equal(Object.hasOwn(clone, "__proto__"), true);
			assert.equal(Object.getPrototypeOf(clone), Object.prototype);
			assert.notEqual(clone.__proto__, data.__proto__);
			assert.deepEqual(clone, data);
		});
	});

	it('preserves "__proto__" as an own data property', () => {
		const data = { ["__proto__"]: { value: 1 } };
		const clone = cloneWithReplacements(data, "", (_key, value) => ({
			clone: true,
			value,
		})) as typeof data;
		assert.equal(Object.hasOwn(clone, "__proto__"), true);
		assert.equal(Object.getPrototypeOf(clone), Object.prototype);
		assert.notEqual(clone.__proto__, data.__proto__);
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
