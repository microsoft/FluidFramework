/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { capitalize, lazy, mapIterable, transformObjectMap } from "../../util/index.js";
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

	it("lazy", () => {
		let evaluations = 0;
		const getThree = lazy(() => {
			evaluations += 1;
			return 3;
		});

		assert.equal(evaluations, 0);
		assert.equal(getThree.evaluated, false);
		assert.equal(getThree(), 3);
		assert.equal(evaluations, 1);
		assert.equal(getThree.evaluated, true);
		assert.equal(getThree(), 3);
		assert.equal(evaluations, 1);
	});
});
