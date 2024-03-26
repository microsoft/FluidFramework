/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	IConfigRange,
	doOverRange,
	doOverRanges,
	resolveRange,
	resolveRanges,
} from "./mergeTreeOperationRunner.js";

describe("MergeTreeOperationRunner combinatorial utils", () => {
	const constant = (i: number) => i;
	const plusOne = (i: number) => i + 1;
	const plusTwo = (i: number) => i + 2;
	const timesTwo = (i: number) => i * 2;

	const oneRangeTestCases: {
		name: string;
		range: IConfigRange;
		defaultGrowthFunc: (i: number) => number;
		expected: number[];
	}[] = [
		{
			// worth testing this as baking the policy into doOverRange helps avoid
			// bugs with less obvious cases like growthFunc: i => i * 2 and a value of 0.
			name: "with constant growthFunc",
			range: {
				min: 1,
				max: 5,
			},
			defaultGrowthFunc: constant,
			expected: [1, 2, 3, 4, 5],
		},
		{
			name: "with single element",
			range: {
				min: 1,
				max: 1,
			},
			defaultGrowthFunc: plusOne,
			expected: [1],
		},
		{
			name: "over negative numbers",
			range: {
				min: -2,
				max: 2,
			},
			defaultGrowthFunc: plusTwo,
			expected: [-2, 0, 2],
		},
		{
			name: "with simple growthFunc",
			range: {
				min: 0,
				max: 8,
			},
			defaultGrowthFunc: timesTwo,
			expected: [0, 1, 2, 4, 8],
		},
		{
			name: "overrides defaultGrowthFunc with config range's growthFunc",
			range: {
				min: 1,
				max: 4,
				growthFunc: timesTwo,
			},
			defaultGrowthFunc: plusOne,
			expected: [1, 2, 4],
		},
	];

	describe("doOverRange", () => {
		for (const { name, range, defaultGrowthFunc, expected } of oneRangeTestCases) {
			it(name, () => {
				const actual: number[] = [];
				doOverRange(range, defaultGrowthFunc, (i) => actual.push(i));
				assert.deepEqual(actual, expected);
			});
		}
	});

	describe("resolveRange", () => {
		for (const { name, range, defaultGrowthFunc, expected } of oneRangeTestCases) {
			it(name, () => {
				assert.deepEqual(resolveRange(range, defaultGrowthFunc), expected);
			});
		}
	});

	describe("doOverRanges", () => {
		const doOverRangesCases: { name: string; ranges: any; expected: any[] }[] = [
			{
				name: "with no ranges",
				ranges: { a: 1, growthFunc: constant },
				expected: [{}],
			},
			{
				name: "with single property range",
				ranges: { a: { min: 1, max: 2 }, growthFunc: plusOne },
				expected: [{ a: 1 }, { a: 2 }],
			},
			{
				name: "with single property range and a property without a range",
				ranges: { a: { min: 1, max: 2 }, b: 3, growthFunc: plusOne },
				expected: [{ a: 1 }, { a: 2 }],
			},
			{
				name: "with multiple property ranges",
				ranges: {
					a: { min: 1, max: 5, growthFunc: timesTwo },
					b: { min: 3, max: 4 },
					growthFunc: plusOne,
				},
				expected: [
					{ a: 1, b: 3 },
					{ a: 1, b: 4 },
					{ a: 2, b: 3 },
					{ a: 2, b: 4 },
					{ a: 4, b: 3 },
					{ a: 4, b: 4 },
				],
			},
		];

		for (const { name, ranges, expected } of doOverRangesCases) {
			it(name, () => {
				const actual: any[] = [];
				doOverRanges(ranges, (i) => actual.push(i));
				assert.deepEqual(actual, expected);
			});
		}
	});

	describe("resolveRanges", () => {
		const resolveRangesCases: { name: string; ranges: any; expected: any }[] = [
			{
				name: "with no ranges",
				ranges: { a: 1, growthFunc: constant },
				expected: {},
			},
			{
				name: "with single property range",
				ranges: { a: { min: 1, max: 2 }, growthFunc: plusOne },
				expected: { a: [1, 2] },
			},
			{
				name: "with single property range and a property without a range",
				ranges: { a: { min: 1, max: 2 }, b: 3, growthFunc: plusOne },
				expected: { a: [1, 2] },
			},
			{
				name: "with multiple property ranges",
				ranges: {
					a: { min: 1, max: 5, growthFunc: timesTwo },
					b: { min: 3, max: 4 },
					growthFunc: plusOne,
				},
				expected: { a: [1, 2, 4], b: [3, 4] },
			},
		];

		for (const { name, ranges, expected } of resolveRangesCases) {
			it(name, () => {
				assert.deepEqual(resolveRanges(ranges, ranges.growthFunc), expected);
			});
		}
	});
});
