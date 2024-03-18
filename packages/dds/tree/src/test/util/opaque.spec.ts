/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ExtractFromOpaque,
	Opaque,
	brandOpaque,
	extractFromOpaque,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../util/opaque.js";

import {
	Brand,
	BrandedType,
	Erased,
	areSafelyAssignable,
	isAny,
	isAssignableTo,
	requireFalse,
	requireTrue,
} from "../../util/index.js";

// These tests currently just cover the type checking, so its all compile time.

export type T1 = Brand<number, "1">;
export type T2 = Brand<number, "2">;

interface O1 extends Opaque<T1> {}
interface O2 extends Opaque<T2> {}

type _check =
	| requireTrue<areSafelyAssignable<ExtractFromOpaque<O1>, T1>>
	| requireTrue<areSafelyAssignable<ExtractFromOpaque<O2>, T2>>
	// Check covariant ValueType
	| requireFalse<isAssignableTo<O1, O2>>;

const _opaque: O1 = brandOpaque<O1>(0);

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
