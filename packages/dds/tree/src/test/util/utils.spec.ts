/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	balancedReduce,
	capitalize,
	copyProperty,
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

	describe("copyProperty", () => {
		it("copies a known property", () => {
			const source = { a: 3 };
			const destination = {};
			copyProperty(source, "a", destination);
			// `destination` should now be typed to have a property "a"
			assert.equal(destination.a, 3);
		});

		it("does nothing if the property is not present", () => {
			const source = {};
			const destination = {};
			copyProperty(undefined, "a", destination);
			copyProperty(source, "a", destination);
			assert.equal(Reflect.has(destination, "a"), false);
		});

		it("does nothing if the property is present but undefined", () => {
			const source = { a: undefined };
			const destination = {};
			copyProperty(source, "a", destination);
			assert.equal(Reflect.has(destination, "a"), false);
		});
	});

	describe("balancedReduce", () => {
		let delegateCallCount = 0;
		const concatDelegate = (a: string, b: string) => {
			delegateCallCount += 1;
			return a + b;
		};

		let factoryCallCount = 0;
		const factory = () => {
			factoryCallCount += 1;
			return "factory";
		};

		beforeEach(() => {
			factoryCallCount = 0;
			delegateCallCount = 0;
		});

		it("uses empty case factory on empty input", () => {
			const actual = balancedReduce([], concatDelegate, factory);
			assert.equal(actual, "factory");
			assert.equal(factoryCallCount, 1);
			assert.equal(delegateCallCount, 0);
		});

		it("returns lone element on size 1 input", () => {
			const actual = balancedReduce(["lone"], concatDelegate, factory);
			assert.equal(actual, "lone");
			assert.equal(factoryCallCount, 0);
			assert.equal(delegateCallCount, 0);
		});

		it("calls delegate once on size 2 input", () => {
			const actual = balancedReduce(["A", "B"], concatDelegate, factory);
			assert.equal(actual, "AB");
			assert.equal(factoryCallCount, 0);
			assert.equal(delegateCallCount, 1);
		});

		it("calls delegate twice on size 3 input", () => {
			const actual = balancedReduce(["A", "B", "C"], concatDelegate, factory);
			assert.equal(actual, "ABC");
			assert.equal(factoryCallCount, 0);
			assert.equal(delegateCallCount, 2);
		});

		it("calls delegate with balanced inputs", () => {
			const delegate = (a: string, b: string) => {
				delegateCallCount += 1;
				// Checks that the inputs are balanced.
				assert(Math.abs(a.length - b.length) <= 1);
				return a + b;
			};
			const actual = balancedReduce(["A", "B", "C", "E", "F", "G", "H"], delegate, factory);
			assert.equal(actual, "ABCEFGH");
			assert.equal(factoryCallCount, 0);
			assert.equal(delegateCallCount, 6);
		});
	});
});
