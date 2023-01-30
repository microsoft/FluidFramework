/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { compareArrays } from "../../compare";

const a4 = Array.from({ length: 4 }).fill(0);
const a1024 = Array.from({ length: 1024 }).fill(0);

const comparisons: [string, unknown[], unknown[]][] = [
	["trivial rejection based on length", a1024, a1024.slice(1)],
	["trivial acceptance based on ref", a1024, a1024],
	["compare empty", [], []],
	[`compare ${a4.length} items`, [...a4], [...a4]],
	[`compare ${a1024.length} items`, [...a1024], [...a1024]],
];

function compareWithFor<T>(left: readonly T[], right: readonly T[]): boolean {
	if (left.length !== right.length) {
		return false;
	}

	for (let index = 0; index < left.length; index++) {
		if (left[index] !== right[index]) {
			return false;
		}
	}

	return true;
}

function compareWithEvery<T>(left: readonly T[], right: readonly T[]): boolean {
	return (
		left.length === right.length && left.every((leftItem, index) => leftItem === right[index])
	);
}

function compareWithObjectIs<T>(left: readonly T[], right: readonly T[]): boolean {
	return (
		left.length === right.length &&
		left.every((leftItem, index) => Object.is(leftItem, right[index]))
	);
}

describe("compareArrays()", () => {
	describe.skip("baseline", () => {
		describe("using for-loop", () => {
			for (const [title, left, right] of comparisons) {
				benchmark({
					type: BenchmarkType.Measurement,
					title: `${title}`,
					before: () => {},
					benchmarkFn: () => {
						compareWithFor(left, right);
					},
				});
			}
		});

		describe("using Array.every()", () => {
			for (const [title, left, right] of comparisons) {
				benchmark({
					type: BenchmarkType.Measurement,
					title: `${title}`,
					before: () => {},
					benchmarkFn: () => {
						compareWithEvery(left, right);
					},
				});
			}
		});

		describe("using Object.is()", () => {
			for (const [title, left, right] of comparisons) {
				benchmark({
					type: BenchmarkType.Measurement,
					title: `${title}`,
					before: () => {},
					benchmarkFn: () => {
						compareWithObjectIs(left, right);
					},
				});
			}
		});
	});

	describe("no callback", () => {
		for (const [title, left, right] of comparisons) {
			benchmark({
				type: BenchmarkType.Measurement,
				title: `${title}`,
				before: () => {},
				benchmarkFn: () => {
					compareArrays(left, right);
				},
			});
		}
	});

	describe("with callback", () => {
		let sum = 0;

		for (const [title, left, right] of comparisons) {
			benchmark({
				type: BenchmarkType.Measurement,
				title: `${title}`,

				benchmarkFn: () => {
					compareArrays(left, right, (leftItem, rightItem, index) => {
						sum += index;
						return Object.is(leftItem, rightItem);
					});
				},

				after: () => {
					// Paranoid usage of 'sum' to prevent dead code optimization.
					console.log(`after: ${sum}`);
				},
			});
		}
	});
});
