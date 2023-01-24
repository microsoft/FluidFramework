/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Named } from "../../../../core";
import {
    AsNames,
    ListToKeys,
    WithDefault,
    // Allow importing from this specific file which is being tested:
    /* eslint-disable-next-line import/no-internal-modules */
} from "../../../../feature-libraries/modular-schema/typedSchema/typeUtils";
import { areSafelyAssignable, requireTrue } from "../../../../util";

// These tests currently just cover the type checking, so its all compile time.

type X2 = WithDefault<undefined, readonly []>;

// eslint-disable-next-line @typescript-eslint/ban-types
type X3 = WithDefault<undefined, {}>;

type X = ["cat", "dog"];

type Y = ListToKeys<X, unknown>;

type List = ["a", { name: "b" }];
type Names = AsNames<List>;
type Obj = ListToKeys<Names, unknown>;

type check1_ = requireTrue<areSafelyAssignable<Obj, { a: unknown; b: unknown }>>;

type Names2 = AsNames<X2>;
type Obj2 = ListToKeys<Names2, unknown>;

type check2_ = requireTrue<areSafelyAssignable<Obj2, Record<string, never>>>;

type objGeneric = AsNames<readonly (string | Named<string>)[]>;
type check4_ = requireTrue<areSafelyAssignable<objGeneric, readonly string[]>>;
