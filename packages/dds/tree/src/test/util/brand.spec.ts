/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Brand,
	Opaque,
	ExtractFromOpaque,
	brand,
	brandOpaque,
	extractFromOpaque,
	BrandedType,
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
	isAny,
} from "../../util/index.js";

// These tests currently just cover the type checking, so its all compile time.

export type T1 = Brand<number, "1">;
export type T2 = Brand<number, "2">;
export type T3 = Brand<{ test: number }, "2">;

type Intersected = T1 & T2;
type T1Constant = Brand<4, "1">;

interface O1 extends Opaque<T1> {}
interface O2 extends Opaque<T2> {}
interface O3 extends Opaque<T3> {}

type _check =
	| requireTrue<areSafelyAssignable<ExtractFromOpaque<O1>, T1>>
	| requireTrue<areSafelyAssignable<ExtractFromOpaque<O2>, T2>>
	| requireTrue<areSafelyAssignable<ExtractFromOpaque<O3>, T3>>
	// Check covariant ValueType
	| requireTrue<isAssignableTo<T1Constant, T1>>
	| requireFalse<isAssignableTo<O1, O2>>
	| requireFalse<isAssignableTo<T1, T2>>
	// Check multiple brands don't produce never.
	| requireFalse<isAssignableTo<Intersected, never>>;

const _branded: T1 = brand(0);
const _opaque: O1 = brandOpaque<O1>(0);

// @ts-expect-error No type to infer: does not build.
const _branded2 = brand(0);

// @ts-expect-error No type to infer: does not build.
const untypedOpaque = brandOpaque(0);

// If somehow an untyped opaque handle is produced, make sure any does not leak out:
const extracted = extractFromOpaque(0 as any as BrandedType<any, string>);
type _check2 = requireFalse<isAny<typeof extracted>>;

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
