/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	capitalize,
	defineLazyCachedProperty,
	mapIterable,
	transformObjectMap,
} from "../../util/index.js";
import { benchmark } from "@fluid-tools/benchmark";

describe("Utils", () => {
	it("capitalize", () => {
		const data: [string, string][] = [
			["", ""],
			["a", "A"],
			["aa", "Aa"],
			// Non-ascii
			["ñx", "Ñx"],
			// Lowercase letter that is 2 UTF-16 code units:
			["𞥃", "𞤡"],
			["𞥃a", "𞤡a"],
		];
		for (const [input, expected] of data) {
			assert.equal(capitalize(input), expected);
		}
	});

	it("transformObjectMap", () => {
		assert.deepEqual(
			transformObjectMap({ a: "b", c: "d" }, (value, key) => `${key}${value}`),
			Object.assign(Object.create(null), { a: "ab", c: "cd" }),
		);
	});

	const testMap: Map<number, number> = new Map();
	for (let index = 0; index < 1000; index++) {
		testMap.set(index, index * 2);
	}

	benchmark({
		title: `map from map spread`,
		benchmarkFn: () => {
			const m = new Map([...testMap].map(([k, v]) => [k, v] as const));
		},
	});

	benchmark({
		title: `map from mapIterable`,
		benchmarkFn: () => {
			const m = new Map(mapIterable(testMap, ([k, v]) => [k, v] as const));
		},
	});

	it("defineLazyCachedProperty", () => {
		const obj = {};
		let count = 0;
		const objWithProperty = defineLazyCachedProperty(obj, "prop", () => {
			count += 1;
			return 3;
		});

		assert.equal(count, 0);
		assert.equal(objWithProperty.prop, 3);
		assert.equal(count, 1);
		assert.equal(objWithProperty.prop, 3);
		assert.equal(count, 1);
	});
});
