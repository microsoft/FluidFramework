/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Allow importing from this specific file which is being tested:

import {
    Brand,
    Opaque,
    ExtractFromOpaque,
    asBranded,
    asOpaque,
} from "../brand";
import { areSafelyAssignable, isAssignableTo, requireTrue, requireFalse } from "../typeCheck";

// These tests currently just cover the type checking, so its all compile time.

export type T1 = Brand<number, "1">;
export type T2 = Brand<number, "2">;
export type T3 = Brand<{ test: number; }, "2">;

type O1 = Opaque<T1>;
type O2 = Opaque<T2>;
type O3 = Opaque<T3>;

type _check =
    | requireTrue<areSafelyAssignable<ExtractFromOpaque<O1>, T1>>
    | requireTrue<areSafelyAssignable<ExtractFromOpaque<O2>, T2>>
    | requireTrue<areSafelyAssignable<ExtractFromOpaque<O3>, T3>>
    | requireFalse<isAssignableTo<O1, O2>>
    | requireFalse<isAssignableTo<T1, T2>>;

const _branded: T1 = asBranded(0);
const _opaque: O1 = asOpaque<O1>(0);
