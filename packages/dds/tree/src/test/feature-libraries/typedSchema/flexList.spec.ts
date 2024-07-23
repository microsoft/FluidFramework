/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	type ArrayHasFixedLength,
	type FlexList,
	type FlexListToLazyArray,
	type FlexListToNonLazyArray,
	type FlexListToUnion,
	type LazyItem,
	isLazy,
	markEager,
	normalizeFlexListEager,
	normalizeFlexListLazy,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../../feature-libraries/typed-schema/flexList.js";
import type {
	areSafelyAssignable,
	requireAssignableTo,
	requireFalse,
	requireTrue,
} from "../../../util/index.js";

// Test ArrayHasFixedLength
{
	type _check1 = requireTrue<ArrayHasFixedLength<[]>>;
	type _check2 = requireTrue<ArrayHasFixedLength<readonly []>>;
	type _check3 = requireTrue<ArrayHasFixedLength<[0]>>;
	type _check4 = requireTrue<ArrayHasFixedLength<[1, 2, 3]>>;

	type _check5 = requireFalse<ArrayHasFixedLength<number[]>>;
	type _check6 = requireFalse<ArrayHasFixedLength<readonly number[]>>;
	type _check7 = requireFalse<ArrayHasFixedLength<string[]>>;

	// Cases like this are not super clear how they should be handled, but currently are as indicated below:
	type _check8 = requireTrue<ArrayHasFixedLength<[0] | []>>;
	type _check9 = requireFalse<ArrayHasFixedLength<[0] | string[]>>;
}

// Test FlexListToNonLazyArray
{
	type a = FlexListToNonLazyArray<[]>;
	type checkA = requireAssignableTo<a, []>;

	type b = FlexListToNonLazyArray<[1]>;
	type checkB = requireAssignableTo<b, [1]>;

	type c = FlexListToNonLazyArray<[() => 1]>;
	type checkC = requireAssignableTo<c, [1]>;

	type d = FlexListToNonLazyArray<[2, () => 1]>;
	type checkD = requireAssignableTo<d, [2, 1]>;

	type e = FlexListToNonLazyArray<readonly [2]>;
	type checkE = requireAssignableTo<e, [2]>;

	type f = FlexListToNonLazyArray<readonly [2, () => 1]>;
	type checkF = requireAssignableTo<f, [2, 1]>;

	type g = FlexListToNonLazyArray<LazyItem<number>[]>;
	type checkG = requireAssignableTo<readonly number[], g>;
}

// Test FlexListToLazyArray
{
	type a = FlexListToLazyArray<[]>;
	type checkA = requireAssignableTo<a, []>;

	type b = FlexListToLazyArray<[1]>;
	type checkB = requireAssignableTo<b, [() => 1]>;

	type c = FlexListToLazyArray<[() => 1]>;
	type checkC = requireAssignableTo<c, [() => 1]>;

	type d = FlexListToLazyArray<[2, () => 1]>;
	type checkD = requireAssignableTo<d, [() => 2, () => 1]>;

	type e = FlexListToLazyArray<readonly [2]>;
	type checkE = requireAssignableTo<e, [() => 2]>;
}

// Test FlexListToNonLazyArray
{
	type a = FlexListToNonLazyArray<number[]>;
	type checkA = requireTrue<areSafelyAssignable<a, readonly number[]>>;

	type b = FlexListToNonLazyArray<[]>;
	type checkB = requireTrue<areSafelyAssignable<b, []>>;

	type c = FlexListToNonLazyArray<[() => 5, 6, () => 7]>;
	type checkC = requireTrue<areSafelyAssignable<c, [5, 6, 7]>>;
}

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
	it("correctly normalizes lists to be lazy", () => {
		const list = [2, (): 1 => 1] as const;
		const normalized = normalizeFlexListLazy(list);
		assert(normalized.length === 2);
		const data = normalized.map((f) => f());
		assert.deepEqual(data, [2, 1]);
	});

	it("correctly normalizes lists to be eager", () => {
		const list = [2, (): 1 => 1] as const;
		const normalized: readonly [2, 1] = normalizeFlexListEager(list);
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
		normalizeFlexListLazy(list).forEach((g) => assert.equal(g()(), 42));
	});
});
