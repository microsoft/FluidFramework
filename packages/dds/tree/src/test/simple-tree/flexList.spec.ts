/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type FlexList,
	type FlexListToUnion,
	isLazy,
	markEager,
	normalizeFlexListEager,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../simple-tree/flexList.js";
import type { areSafelyAssignable, requireTrue } from "../../util/index.js";

// Test FlexListToUnion
{
	type a = FlexListToUnion<number[]>;
	type checkA = requireTrue<areSafelyAssignable<a, number>>;

	type b = FlexListToUnion<[]>;
	type checkB = requireTrue<areSafelyAssignable<b, never>>;

	type c = FlexListToUnion<[() => 5, 6, () => 7]>;
	type checkC = requireTrue<areSafelyAssignable<c, 5 | 6 | 7>>;
}

describe("FlexList", () => {
	it("correctly normalizes lists to be eager", () => {
		const list = [2, (): 1 => 1] as const;
		const normalized: readonly (1 | 2)[] = normalizeFlexListEager(list);
		assert.deepEqual(normalized, [2, 1]);
	});

	it("can mark functions as eager", () => {
		const fn = () => 42;
		assert.equal(isLazy(fn), true);
		markEager(fn);
		assert.equal(isLazy(fn), false);
	});

	it("correctly normalizes functions marked as eager", () => {
		const eagerGenerator = markEager(() => 42);
		const lazyGenerator = () => () => 42;
		const list: FlexList<() => number> = [eagerGenerator, lazyGenerator];
		normalizeFlexListEager(list).forEach((g) => assert.equal(g(), 42));
	});
});
