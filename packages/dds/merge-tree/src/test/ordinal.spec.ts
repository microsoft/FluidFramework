/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import assert from "assert";
import { computeHierarchicalOrdinal } from "../ordinal";
import { doOverRange } from "./mergeTreeOperationRunner";

function computeNumericOrdinal(index: number) {
	const prefixLen = Math.floor(index / 0xffff);
	const prefix = String.fromCharCode(0xffff).repeat(prefixLen);
	return `${prefix}${String.fromCharCode(index - prefixLen * 0xffff)}`;
}

describe("MergeTree.ordinals", () => {
	doOverRange(
		{ min: 1, max: 16 },
		(i) => i + 1,
		(max) => {
			let parentOrdinal = String.fromCharCode(0);
			it(`Max ${max}`, () => {
				doOverRange(
					{ min: 1, max },
					(i) => i + 1,
					(count) => {
						let previous: string = "";
						for (let i = 0; i < count; i++) {
							const current = computeHierarchicalOrdinal(
								max,
								count,
								parentOrdinal,
								previous,
							);
							assert(
								current > previous,
								"subsequent ordinal should be greater than previous",
							);
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
