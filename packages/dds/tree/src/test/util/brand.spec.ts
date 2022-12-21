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
    // Allow importing from this specific file which is being tested:
    /* eslint-disable-next-line import/no-internal-modules */
} from "../../util/brand";

import { areSafelyAssignable, isAssignableTo, requireTrue, requireFalse, isAny } from "../../util";

// These tests currently just cover the type checking, so its all compile time.

export type T1 = Brand<number, "1">;
export type T2 = Brand<number, "2">;
export type T3 = Brand<{ test: number }, "2">;

interface O1 extends Opaque<T1> {}
interface O2 extends Opaque<T2> {}
interface O3 extends Opaque<T3> {}

type _check =
    | requireTrue<areSafelyAssignable<ExtractFromOpaque<O1>, T1>>
    | requireTrue<areSafelyAssignable<ExtractFromOpaque<O2>, T2>>
    | requireTrue<areSafelyAssignable<ExtractFromOpaque<O3>, T3>>
    | requireFalse<isAssignableTo<O1, O2>>
    | requireFalse<isAssignableTo<T1, T2>>;

const _branded: T1 = brand(0);
const _opaque: O1 = brandOpaque<O1>(0);

// No type to infer: does not build.
// const _branded2 = brand(0);

// No type to infer: does not build.
// const untypedOpaque = brandOpaque(0);

// If somehow an untyped opaque handle is produced, make sure any does not leak out:
const extracted = extractFromOpaque(0 as any as BrandedType<any, string>);
type _check2 = requireFalse<isAny<typeof extracted>>;
