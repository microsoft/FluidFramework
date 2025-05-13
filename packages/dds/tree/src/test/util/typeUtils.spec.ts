/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	areSafelyAssignable,
	requireAssignableTo,
	requireFalse,
	requireTrue,
} from "../../util/index.js";
import type {
	IsUnion,
	RestrictiveReadonlyRecord,
	RestrictiveStringRecord,
	UnionToIntersection,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../util/typeUtils.js";

// These tests currently just cover the type checking, so its all compile time.

// Test RestrictiveReadonlyRecord
{
	const empty = {};
	const one = { a: 1 } as const;
	const constOne = { a: 1 } as const;

	type check1_ = requireAssignableTo<typeof empty, RestrictiveReadonlyRecord<string, number>>;
	type check2_ = requireAssignableTo<typeof one, RestrictiveReadonlyRecord<string, number>>;
	type check3_ = requireAssignableTo<
		typeof constOne,
		RestrictiveReadonlyRecord<string, number>
	>;

	const sym = { [Symbol.iterator]: 1 };
	// @ts-expect-error reject symbols
	type check4_ = requireAssignableTo<typeof sym, RestrictiveReadonlyRecord<string, number>>;

	// @ts-expect-error Known bug: stricter key types fail
	type check5_ = requireAssignableTo<typeof constOne, RestrictiveReadonlyRecord<"a", number>>;
}

// Test RestrictiveStringRecord
{
	const empty = {};
	const one = { a: 1 } as const;
	const constOne = { a: 1 } as const;

	type check1_ = requireAssignableTo<typeof empty, RestrictiveStringRecord<number>>;
	type check2_ = requireAssignableTo<typeof one, RestrictiveStringRecord<number>>;
	type check3_ = requireAssignableTo<typeof constOne, RestrictiveStringRecord<number>>;

	const sym = { [Symbol.iterator]: 1 };
	// @ts-expect-error reject symbols
	type check4_ = requireAssignableTo<typeof sym, RestrictiveStringRecord<number>>;

	// Record does not work as desired for this!
	type check5_ = requireAssignableTo<typeof sym, Record<string, number>>;

	const x: RestrictiveStringRecord<number> = one;
	const y = x[Symbol.iterator];
	// Ensure `never` does not leak out.
	type check6_ = requireTrue<areSafelyAssignable<undefined, typeof y>>;

	type keys = keyof RestrictiveStringRecord<number>;
	// Ideally the keys would be strings, but they are string | symbol
	type check7_ = requireTrue<areSafelyAssignable<keys, string | symbol>>;
}

// Test IsUnion
{
	type _check1 = requireTrue<IsUnion<1 | 2>>;
	type _check2 = requireFalse<IsUnion<number | 1>>;
	type _check3 = requireTrue<IsUnion<1 | string>>;
	type _check4 = requireFalse<IsUnion<"hi">>;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	type _check5 = requireFalse<IsUnion<any>>;
	type _check6 = requireFalse<IsUnion<unknown>>;
	type _check7 = requireFalse<IsUnion<never>>;
}

// Test UnionToIntersection
{
	type _check1 = requireTrue<areSafelyAssignable<UnionToIntersection<1>, 1>>;
	type _check2 = requireTrue<areSafelyAssignable<UnionToIntersection<1 | 2>, never>>;
	type _check3 = requireTrue<
		areSafelyAssignable<UnionToIntersection<{ x: 1 | 2 } | { x: 2 | 3 }>, { x: 2 }>
	>;
	type _check4 = requireTrue<areSafelyAssignable<UnionToIntersection<1>, 1>>;
}
