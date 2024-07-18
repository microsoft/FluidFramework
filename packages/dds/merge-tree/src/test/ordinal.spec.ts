/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";

import { computeHierarchicalOrdinal } from "../ordinal.js";

import { doOverRange } from "./mergeTreeOperationRunner.js";

function computeNumericOrdinal(index: number): string {
	const prefixLen = Math.floor(index / 0xffff);
	// Ordinals exist purely for lexicographical sort order and use a small set of valid bytes for each string character.
	// The extra handling fromCodePoint has for things like surrogate pairs is therefore unnecessary.
	// eslint-disable-next-line unicorn/prefer-code-point
	const prefix = String.fromCharCode(0xffff).repeat(prefixLen);
	// eslint-disable-next-line unicorn/prefer-code-point
	return `${prefix}${String.fromCharCode(index - prefixLen * 0xffff)}`;
}

describe("MergeTree.ordinals", () => {
	doOverRange(
		{ min: 1, max: 16 },
		(i) => i + 1,
		(max) => {
			// eslint-disable-next-line unicorn/prefer-code-point
			let parentOrdinal = String.fromCharCode(0);
			it(`Max ${max}`, () => {
				doOverRange(
					{ min: 1, max },
					(i) => i + 1,
					(count) => {
						let previous: string = "";
						for (let i = 0; i < count; i++) {
							const current = computeHierarchicalOrdinal(max, count, parentOrdinal, previous);
							assert(current > previous, "subsequent ordinal should be greater than previous");
							assert(
								current.length > parentOrdinal.length,
								"child ordinals should be  more than parent",
							);
							previous = current;
						}
						parentOrdinal = previous ?? parentOrdinal;
					},
				);
			});
		},
	);

	it("numericOrdinal", () => {
		// eslint-disable-next-line unicorn/prefer-code-point
		let previous = String.fromCharCode(0);
		for (let i = 2; i < Number.MAX_SAFE_INTEGER; i = Math.pow(i, 2)) {
			const current = computeNumericOrdinal(i);
			assert(
				current > previous,
				`subsequent ordinal should be greater than previous ${i.toString(16)}`,
			);
			previous = current;
		}
	});
});
