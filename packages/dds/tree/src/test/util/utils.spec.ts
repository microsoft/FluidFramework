/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { benchmark } from "@fluid-tools/benchmark";

import { compareRevisions as comparePartialRevisions } from "../../core/index.js";
import {
	balancedReduce,
	capitalize,
	compareNumbers,
	comparePartialNumbers,
	comparePartialStrings,
	compareStrings,
	copyProperty,
	defineLazyCachedProperty,
	iterableHasSome,
	mapIterable,
	oneFromIterable,
	transformObjectMap,
} from "../../util/index.js";

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

	it("iterableHasSome", () => {
		assert(!iterableHasSome([]));
		assert(iterableHasSome([1]));
		assert(!iterableHasSome(new Map([])));
	});

	it("oneFromIterable", () => {
		assert.equal(oneFromIterable([undefined]), undefined);
		assert.equal(oneFromIterable([]), undefined);
		assert.equal(oneFromIterable(["x"]), "x");
		assert.equal(oneFromIterable(["x", "x"]), undefined);
		assert.equal(oneFromIterable(new Set([])), undefined);
		assert.equal(oneFromIterable(new Set([5])), 5);
		assert.equal(oneFromIterable(new Set([1, 2])), undefined);
	});

	describe("comparators", () => {
		describe("compareNumbers", () => {
			it("handles NaN correctly", () => {
				// NaN equals itself
				assert.equal(compareNumbers(Number.NaN, Number.NaN), 0);
				// NaN is less than any number
				assert(compareNumbers(Number.NaN, 0) < 0);
				assert(compareNumbers(Number.NaN, -Infinity) < 0);
				assert(compareNumbers(Number.NaN, Infinity) < 0);
				assert(compareNumbers(Number.NaN, 1) < 0);
				assert(compareNumbers(Number.NaN, -1) < 0);
				// Any number is greater than NaN
				assert(compareNumbers(0, Number.NaN) > 0);
				assert(compareNumbers(-Infinity, Number.NaN) > 0);
				assert(compareNumbers(Infinity, Number.NaN) > 0);
			});

			it("orders numbers correctly", () => {
				// Basic ordering: negative < zero < positive
				assert(compareNumbers(-1, 0) < 0);
				assert(compareNumbers(0, 1) < 0);
				assert(compareNumbers(-1, 1) < 0);

				// Decimal ordering
				assert(compareNumbers(-1.5, -1) < 0);
				assert(compareNumbers(1, 1.5) < 0);
				assert(compareNumbers(-1.5, 1.5) < 0);

				// Reflexivity
				assert.equal(compareNumbers(0, 0), 0);
				assert.equal(compareNumbers(5, 5), 0);
				assert.equal(compareNumbers(-3.7, -3.7), 0);

				// Anti-symmetry
				assert(compareNumbers(1, 2) < 0);
				assert(compareNumbers(2, 1) > 0);
			});

			it("handles special values", () => {
				// -Infinity < finite < Infinity
				assert(compareNumbers(-Infinity, -1) < 0);
				assert(compareNumbers(-1, 0) < 0);
				assert(compareNumbers(0, 1) < 0);
				assert(compareNumbers(1, Infinity) < 0);
				assert(compareNumbers(-Infinity, Infinity) < 0);

				// Reflexivity with special values
				assert.equal(compareNumbers(-Infinity, -Infinity), 0);
				assert.equal(compareNumbers(Infinity, Infinity), 0);
			});
		});

		describe("comparePartialNumbers", () => {
			it("handles undefined correctly", () => {
				// undefined equals itself
				assert.equal(comparePartialNumbers(undefined, undefined), 0);
				// undefined < any number
				assert(comparePartialNumbers(undefined, 0) < 0);
				assert(comparePartialNumbers(undefined, -1) < 0);
				assert(comparePartialNumbers(undefined, 1) < 0);
				assert(comparePartialNumbers(undefined, Infinity) < 0);
				assert(comparePartialNumbers(undefined, -Infinity) < 0);
				// any number > undefined
				assert(comparePartialNumbers(0, undefined) > 0);
				assert(comparePartialNumbers(-1, undefined) > 0);
				assert(comparePartialNumbers(Infinity, undefined) > 0);
			});

			it("orders numbers correctly", () => {
				// Same tests as compareNumbers
				assert(comparePartialNumbers(-1, 0) < 0);
				assert(comparePartialNumbers(0, 1) < 0);
				assert.equal(comparePartialNumbers(5, 5), 0);
				assert(comparePartialNumbers(2, 1) > 0);
			});

			it("handles NaN correctly", () => {
				// NaN equals itself
				assert.equal(comparePartialNumbers(Number.NaN, Number.NaN), 0);
				// NaN is less than any non-NaN number
				assert(comparePartialNumbers(Number.NaN, 0) < 0);
				assert(comparePartialNumbers(Number.NaN, -Infinity) < 0);
				// Any number is greater than NaN
				assert(comparePartialNumbers(0, Number.NaN) > 0);
				// But undefined < NaN
				assert(comparePartialNumbers(undefined, Number.NaN) < 0);
				assert(comparePartialNumbers(Number.NaN, undefined) > 0);
			});
		});

		describe("compareStrings", () => {
			it("orders strings lexicographically", () => {
				// Basic lexicographic ordering
				assert(compareStrings("a", "b") < 0);
				assert(compareStrings("b", "a") > 0);
				assert.equal(compareStrings("a", "a"), 0);

				// Prefix ordering
				assert(compareStrings("ab", "abc") < 0);
				assert(compareStrings("abc", "ab") > 0);

				// Multi-character differences
				assert(compareStrings("ab", "ac") < 0);
				assert(compareStrings("ac", "ab") > 0);

				// Empty string
				assert(compareStrings("", "a") < 0);
				assert(compareStrings("a", "") > 0);
				assert.equal(compareStrings("", ""), 0);
			});

			it("handles case sensitivity", () => {
				// Uppercase comes before lowercase in Unicode
				assert(compareStrings("A", "a") < 0);
				assert(compareStrings("Z", "a") < 0);
			});
		});

		describe("comparePartialStrings", () => {
			it("handles undefined correctly", () => {
				// undefined equals itself
				assert.equal(comparePartialStrings(undefined, undefined), 0);
				// undefined < any string
				assert(comparePartialStrings(undefined, "") < 0);
				assert(comparePartialStrings(undefined, "a") < 0);
				assert(comparePartialStrings(undefined, "z") < 0);
				// any string > undefined
				assert(comparePartialStrings("", undefined) > 0);
				assert(comparePartialStrings("a", undefined) > 0);
			});

			it("orders strings lexicographically", () => {
				// Same tests as compareStrings
				assert(comparePartialStrings("a", "b") < 0);
				assert(comparePartialStrings("b", "a") > 0);
				assert.equal(comparePartialStrings("hello", "hello"), 0);
				assert(comparePartialStrings("", "a") < 0);
			});
		});

		describe("comparePartialRevisions", () => {
			it("handles undefined correctly", () => {
				// undefined equals itself
				assert.equal(comparePartialRevisions(undefined, undefined), 0);
			});

			it("orders numbers correctly", () => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				assert(comparePartialRevisions(1 as any, 2 as any) < 0);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				assert(comparePartialRevisions(2 as any, 1 as any) > 0);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				assert.equal(comparePartialRevisions(5 as any, 5 as any), 0);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				assert(comparePartialRevisions(-1 as any, 0 as any) < 0);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				assert(comparePartialRevisions(100 as any, 200 as any) < 0);
			});

			it("orders strings correctly", () => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				assert(comparePartialRevisions("a" as any, "b" as any) < 0);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				assert(comparePartialRevisions("b" as any, "a" as any) > 0);
				assert.equal(comparePartialRevisions("root", "root"), 0);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				assert(comparePartialRevisions("foo" as any, "bar" as any) > 0);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				assert(comparePartialRevisions("apple" as any, "banana" as any) < 0);
			});

			it("orders mixed types correctly: undefined < string < number", () => {
				// undefined < string
				assert(comparePartialRevisions(undefined, "root") < 0);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				assert(comparePartialRevisions(undefined, "a" as any) < 0);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				assert(comparePartialRevisions(undefined, "z" as any) < 0);
				assert(comparePartialRevisions("root", undefined) > 0);

				// undefined < number
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				assert(comparePartialRevisions(undefined, 0 as any) < 0);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				assert(comparePartialRevisions(undefined, 1 as any) < 0);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				assert(comparePartialRevisions(undefined, -1 as any) < 0);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				assert(comparePartialRevisions(0 as any, undefined) > 0);

				// string < number
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				assert(comparePartialRevisions("root", 0 as any) < 0);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				assert(comparePartialRevisions("a" as any, 1 as any) < 0);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				assert(comparePartialRevisions("z" as any, -1 as any) < 0);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				assert(comparePartialRevisions(0 as any, "root") > 0);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				assert(comparePartialRevisions(1 as any, "a" as any) > 0);
			});

			it("maintains total ordering across all types", () => {
				// Comprehensive ordering: undefined < strings < numbers
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const values: any[] = [undefined, "a", "root", "z", -1, 0, 1, 100];

				// Verify all pairs maintain consistent ordering
				for (let i = 0; i < values.length; i++) {
					for (let j = i + 1; j < values.length; j++) {
						const cmp = comparePartialRevisions(values[i], values[j]);
						assert(
							cmp < 0,
							`Expected ${String(values[i])} < ${String(values[j])}, got ${cmp}`,
						);
						// Anti-symmetry
						const cmpReverse = comparePartialRevisions(values[j], values[i]);
						assert(
							cmpReverse > 0,
							`Expected ${String(values[j])} > ${String(values[i])}, got ${cmpReverse}`,
						);
					}
				}
			});
		});
	});
});
