/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type NestedMap,
	SizedNestedMap,
	deleteFromNestedMap,
	getOrAddInNestedMap,
	getOrDefaultInNestedMap,
	populateNestedMap,
	setInNestedMap,
	tryAddToNestedMap,
	tryGetFromNestedMap,
	mapNestedMap,
} from "../../util/index.js";

describe("NestedMap unit tests", () => {
	describe("tryAddToNestedMap", () => {
		it("New value", () => {
			const nestedMap: NestedMap<string, string, number> = new Map<
				string,
				Map<string, number>
			>();
			const result = tryAddToNestedMap(nestedMap, "Foo", "Bar", 1);
			assert.equal(result, undefined);
			assert.equal(nestedMap.get("Foo")?.get("Bar"), 1);
		});

		it("Existing value", () => {
			const nestedMap: NestedMap<string, string, number> = new Map<
				string,
				Map<string, number>
			>();
			setInNestedMap(nestedMap, "Foo", "Bar", 1);
			const result = tryAddToNestedMap(nestedMap, "Foo", "Bar", 2);
			assert.equal(result, 1);
			assert.equal(nestedMap.get("Foo")?.get("Bar"), 1);
		});
	});

	describe("setInNestedMap", () => {
		it("New value", () => {
			const nestedMap: NestedMap<string, string, number> = new Map<
				string,
				Map<string, number>
			>();
			setInNestedMap(nestedMap, "Foo", "Bar", 1);
			assert.equal(nestedMap.get("Foo")?.get("Bar"), 1);
		});

		it("Existing value", () => {
			const nestedMap: NestedMap<string, string, number> = new Map<
				string,
				Map<string, number>
			>();
			setInNestedMap(nestedMap, "Foo", "Bar", 1);
			setInNestedMap(nestedMap, "Foo", "Bar", 2);
			assert.equal(nestedMap.get("Foo")?.get("Bar"), 2);
		});
	});

	describe("tryGetFromNestedMap", () => {
		it("Non-existing", () => {
			const nestedMap: NestedMap<string, string, number> = new Map<
				string,
				Map<string, number>
			>();
			const result = tryGetFromNestedMap(nestedMap, "Foo", "Bar");
			assert.equal(result, undefined);
		});

		it("Existing", () => {
			const nestedMap: NestedMap<string, string, number> = new Map<
				string,
				Map<string, number>
			>();
			setInNestedMap(nestedMap, "Foo", "Bar", 1);
			const result = tryGetFromNestedMap(nestedMap, "Foo", "Bar");
			assert.equal(result, 1);
		});
	});

	describe("getOrAddInNestedMap", () => {
		it("New value", () => {
			const nestedMap: NestedMap<string, string, number> = new Map<
				string,
				Map<string, number>
			>();
			const result = getOrAddInNestedMap(nestedMap, "Foo", "Bar", 1);
			assert.equal(result, 1);
			assert.equal(nestedMap.get("Foo")?.get("Bar"), 1);
		});

		it("Existing value", () => {
			const nestedMap: NestedMap<string, string, number> = new Map<
				string,
				Map<string, number>
			>();
			setInNestedMap(nestedMap, "Foo", "Bar", 1);
			const result = getOrAddInNestedMap(nestedMap, "Foo", "Bar", 2); // Will not update map since value already exists
			assert.equal(result, 1);
			assert.equal(nestedMap.get("Foo")?.get("Bar"), 1);
		});
	});

	describe("getOrDefaultInNestedMap", () => {
		it("Non-existing", () => {
			const nestedMap: NestedMap<string, string, number> = new Map<
				string,
				Map<string, number>
			>();
			const result = getOrDefaultInNestedMap(nestedMap, "Foo", "Bar", 2);
			assert.equal(result, 2);
		});

		it("Existing", () => {
			const nestedMap: NestedMap<string, string, number> = new Map<
				string,
				Map<string, number>
			>();
			setInNestedMap(nestedMap, "Foo", "Bar", 1);
			const result = getOrDefaultInNestedMap(nestedMap, "Foo", "Bar", 2);
			assert.equal(result, 1);
		});
	});

	describe("deleteFromNestedMap", () => {
		it("Value doesn't exist", () => {
			const nestedMap: NestedMap<string, string, number> = new Map<
				string,
				Map<string, number>
			>();
			const result = deleteFromNestedMap(nestedMap, "Foo", "Bar");
			assert(!result);
			assert.equal(nestedMap.get("Foo")?.get("Bar"), undefined);
		});

		it("Value exists", () => {
			const nestedMap: NestedMap<string, string, number> = new Map<
				string,
				Map<string, number>
			>();
			setInNestedMap(nestedMap, "Foo", "Bar", 1);
			const result = deleteFromNestedMap(nestedMap, "Foo", "Bar");
			assert(result);
			assert.equal(nestedMap.get("Foo")?.get("Bar"), undefined);
		});
	});

	it("SizedNestedMap", () => {
		const map = new SizedNestedMap<string, string, number>();
		assert.equal(map.size, 0);
		assert.equal(map.tryGet("Foo", "Bar"), undefined);
		assert.equal(map.getOrDefault("Foo", "Bar", 0), 0);

		// Add first value
		const addResult1 = map.tryAdd("Foo", "Bar", 1);
		assert.equal(addResult1, undefined);
		assert.equal(map.size, 1);
		assert.equal(map.tryGet("Foo", "Bar"), 1);
		assert.equal(map.getOrDefault("Foo", "Bar", 0), 1);

		// Set second value
		map.set("Foo", "Baz", 2);
		assert.equal(map.size, 2);
		assert.equal(map.tryGet("Foo", "Baz"), 2);
		assert.equal(map.getOrDefault("Foo", "Baz", 0), 2);

		// Enumerate and count entries
		let entryCount = 0;
		map.forEach(() => {
			entryCount++;
		});
		assert.equal(entryCount, 2);

		// Try (and fail) to add a value to an existing key list
		const addResult2 = map.tryAdd("Foo", "Baz", 3);
		assert.equal(addResult2, 2);
		assert.equal(map.size, 2);
		assert.equal(map.tryGet("Foo", "Baz"), 2);
		assert.equal(map.getOrDefault("Foo", "Baz", 0), 2);

		// Override existing value
		map.set("Foo", "Baz", 3);
		assert.equal(map.size, 2);
		assert.equal(map.tryGet("Foo", "Baz"), 3);
		assert.equal(map.getOrDefault("Foo", "Baz", 0), 3);

		// Try (and fail) to delete non-existent entry
		const deleteResult1 = map.delete("Foo", "Qux");
		assert(!deleteResult1);
		assert.equal(map.size, 2);

		// Delete original entry
		const deleteResult2 = map.delete("Foo", "Bar");
		assert(deleteResult2);
		assert.equal(map.size, 1);

		// Clear map
		map.clear();
		assert.equal(map.size, 0);
	});

	describe("populateNestedMap", () => {
		it("can populate an empty nested map", () => {
			const sourceMap: NestedMap<string, string, number> = new Map<
				string,
				Map<string, number>
			>();
			setInNestedMap(sourceMap, "Foo", "Bar", 1);
			setInNestedMap(sourceMap, "Foo", "Baz", 2);

			const destinationMap: NestedMap<string, string, number> = new Map<
				string,
				Map<string, number>
			>();

			populateNestedMap(sourceMap, destinationMap, false);

			assert.deepEqual(
				destinationMap,
				new Map([
					[
						"Foo",
						new Map([
							["Bar", 1],
							["Baz", 2],
						]),
					],
				]),
			);
		});

		it("can override previous values", () => {
			const sourceMap: NestedMap<string, string, number> = new Map<
				string,
				Map<string, number>
			>();
			setInNestedMap(sourceMap, "Foo", "Bar", 1);
			setInNestedMap(sourceMap, "Foo", "Baz", 2);

			const destinationMap: NestedMap<string, string, number> = new Map<
				string,
				Map<string, number>
			>();
			setInNestedMap(destinationMap, "Foo", "Bar", 2);

			populateNestedMap(sourceMap, destinationMap, true);

			assert.deepEqual(
				destinationMap,
				new Map([
					[
						"Foo",
						new Map([
							["Bar", 1],
							["Baz", 2],
						]),
					],
				]),
			);
		});

		it("can choose to not override existing values", () => {
			const sourceMap: NestedMap<string, string, number> = new Map<
				string,
				Map<string, number>
			>();
			setInNestedMap(sourceMap, "Foo", "Bar", 1);
			setInNestedMap(sourceMap, "Foo", "Baz", 2);

			const destinationMap: NestedMap<string, string, number> = new Map<
				string,
				Map<string, number>
			>();
			setInNestedMap(destinationMap, "Foo", "Bar", 2);

			populateNestedMap(sourceMap, destinationMap, false);

			assert.deepEqual(
				destinationMap,
				new Map([
					[
						"Foo",
						new Map([
							["Bar", 2],
							["Baz", 2],
						]),
					],
				]),
			);
		});
	});

	describe("mapNestedMap", () => {
		it("creates a new map with mapped values", () => {
			const input: NestedMap<string, string, number> = new Map<string, Map<string, number>>();
			setInNestedMap(input, "Foo", "Bar", 1);
			setInNestedMap(input, "Foo", "Baz", 2);

			const output = mapNestedMap(input, (n: number) => String(n));

			assert.deepEqual(
				output,
				new Map([
					[
						"Foo",
						new Map([
							["Bar", "1"],
							["Baz", "2"],
						]),
					],
				]),
			);
		});

		it("tolerates empty outer maps", () => {
			const input: NestedMap<string, string, number> = new Map<string, Map<string, number>>();

			const output = mapNestedMap(input, (n: number) => String(n));

			assert.deepEqual(output, new Map([]));
		});

		it("tolerates (and preserves) empty inner maps", () => {
			const input: NestedMap<string, string, number> = new Map<string, Map<string, number>>([
				["Foo", new Map()],
			]);

			const output = mapNestedMap(input, (n: number) => String(n));

			assert.deepEqual(output, new Map([["Foo", new Map()]]));
		});
	});
});
