/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	areSafelyAssignable,
	requireAssignableTo,
	requireTrue,
} from "../../util/index.js";
import type {
	AllowOptional,
	AllowOptionalNotFlattened,
	OptionalFields,
	RequiredFields,
	RestrictiveReadonlyRecord,
	RestrictiveStringRecord,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../util/typeUtils.js";

// These tests currently just cover the type checking, so its all compile time.

// Test OptionalFields
{
	type a = OptionalFields<{ a: 5; b: undefined | 5; c: undefined }>;
	type check1_ = requireAssignableTo<a, { b?: 5 }>;
	type check2_ = requireAssignableTo<{ b?: 5 }, a>;
}

// Test RequiredFields
{
	type a = RequiredFields<{ a: 5; b: undefined | 5; c: undefined }>;
	type check1_ = requireAssignableTo<a, { a: 5 }>;
	type check2_ = requireAssignableTo<{ a: 5 }, a>;
}

// Test AllowOptional
{
	type a = AllowOptional<{ a: 5; b: undefined | 5; c: undefined }>;
	type check1_ = requireAssignableTo<a, { a: 5; b?: 5 }>;
	type check2_ = requireAssignableTo<{ a: 5; b?: 5 }, a>;
}

// Test AllowOptionalNotFlattened
{
	type a = AllowOptionalNotFlattened<{ a: 5; b: undefined | 5; c: undefined }>;
	type check1_ = requireAssignableTo<a, { a: 5; b?: 5 }>;
	type check2_ = requireAssignableTo<{ a: 5; b?: 5 }, a>;
}

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
