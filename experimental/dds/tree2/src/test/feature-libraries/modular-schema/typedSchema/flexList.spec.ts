/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	FlexListToNonLazyArray,
	FlexListToLazyArray,
	normalizeFlexList,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../../../feature-libraries/modular-schema/typedSchema/flexList";
import { requireAssignableTo } from "../../../../util";

// These tests currently just cover the type checking, so its all compile time.

// Test FlexListToNonLazyArray
{
	type a = FlexListToNonLazyArray<number, []>;
	type checkA = requireAssignableTo<a, []>;

	type b = FlexListToNonLazyArray<number, [1]>;
	type checkB = requireAssignableTo<b, [1]>;

	type c = FlexListToNonLazyArray<number, [() => 1]>;
	type checkC = requireAssignableTo<c, [1]>;

	type d = FlexListToNonLazyArray<number, [2, () => 1]>;
	type checkD = requireAssignableTo<d, [2, 1]>;

	type e = FlexListToNonLazyArray<number, readonly [2]>;
	type checkE = requireAssignableTo<e, [2]>;

	type f = FlexListToNonLazyArray<number, readonly [2, () => 1]>;
	type checkF = requireAssignableTo<f, [2, 1]>;

	type g = FlexListToNonLazyArray<number, 5>;
	type checkG = requireAssignableTo<g, [5]>;
}

// Test FlexListToLazyArray
{
	type a = FlexListToLazyArray<number, []>;
	type checkA = requireAssignableTo<a, []>;

	type b = FlexListToLazyArray<number, [1]>;
	type checkB = requireAssignableTo<b, [() => 1]>;

	type c = FlexListToLazyArray<number, [() => 1]>;
	type checkC = requireAssignableTo<c, [() => 1]>;

	type d = FlexListToLazyArray<number, [2, () => 1]>;
	type checkD = requireAssignableTo<d, [() => 2, () => 1]>;

	type e = FlexListToLazyArray<number, readonly [2]>;
	type checkE = requireAssignableTo<e, [() => 2]>;
}

describe("FlexList", () => {
	describe("normalizeFlexList", () => {
		it("normalizeFlexList", () => {
			const list = [2, (): 1 => 1] as const;
			const normalized = normalizeFlexList(list);
			assert(normalized.length === 2);
			const data = normalized.map((f) => f());
			assert.deepEqual(data, [2, 1]);
		});
	});
});
