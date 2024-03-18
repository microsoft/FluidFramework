/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Brand,
	brand,
	Erased,
	fromErased,
	brandErased,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../util/brand.js";

import {
	areSafelyAssignable,
	isAssignableTo,
	requireTrue,
	requireFalse,
} from "../../util/index.js";

// These tests currently just cover the type checking, so its all compile time.

export type T1 = Brand<number, "1">;
export type T2 = Brand<number, "2">;

type Intersected = T1 & T2;
type T1Constant = Brand<4, "1">;

type _check =
	// Check covariant ValueType
	| requireTrue<isAssignableTo<T1Constant, T1>>
	| requireFalse<isAssignableTo<T1, T2>>
	// Check multiple brands don't produce never.
	| requireFalse<isAssignableTo<Intersected, never>>;

const _branded: T1 = brand(0);

// Ensure optional fields can be assigned from brand.
const _branded2: T1 | undefined = brand(0);

// @ts-expect-error No type to infer: does not build.
const _branded3 = brand(0);

// @ts-expect-error Non-branded type does not build.
const _branded4: number = brand(0);

// Erased
interface E4 extends Erased<"4"> {}
interface E5 extends Erased<"5"> {}
export type T4 = Brand<{ test: number }, E4>;
export type T5 = Brand<{ test: number }, E5>;

const erased = brandErased<T4>({ test: 5 });
const branded = fromErased<T4>(erased);
type _check1 =
	| requireTrue<areSafelyAssignable<typeof erased, E4>>
	| requireTrue<areSafelyAssignable<typeof branded, T4>>
	// Check strong typing
	| requireFalse<isAssignableTo<E4, E5>>
	| requireFalse<isAssignableTo<T4, T5>>;
