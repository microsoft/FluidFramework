/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import { NameSet } from "../../../../feature-libraries/modular-schema/typedSchema/outputTypes";
import {
	ArrayToSet,
	ArrayToUnion,
	AsBrandedNames,
	AsNames,
	ListToKeys,
	WithDefault,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../../../feature-libraries/modular-schema/typedSchema/typeUtils";
import {
	areSafelyAssignable,
	Brand,
	isAssignableTo,
	requireAssignableTo,
	requireTrue,
} from "../../../../util";

// These tests currently just cover the type checking, so its all compile time.
{
	type X2 = WithDefault<undefined, []>;

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

	type objGeneric = AsNames<[]>;
	type check4_ = requireTrue<areSafelyAssignable<objGeneric, []>>;
}

// Test ArrayToUnion
{
	type Empty = ArrayToUnion<[]>;
	type checkEmpty_ = requireTrue<isAssignableTo<Empty, never>>;
	type check1_ = requireTrue<areSafelyAssignable<ArrayToUnion<[1]>, 1>>;
	type Case2 = ArrayToUnion<[1, 2]>;
	type check2_ = requireTrue<areSafelyAssignable<Case2, 1 | 2>>;
}

{
	type NameSet1 = ArrayToSet<AsNames<["testType"]>>;
	type NameSet2 = ArrayToSet<["testType"]>;
}

// Test AsNames
{
	type NameSet1 = AsNames<["testType", { name: "2" }]>;
	type NameSet2 = ArrayToSet<["testType"]>;
}

// Test AsBrandedNames
{
	type TestBrand = Brand<string, "tree.TestBrand">;
	type NameSet1 = AsBrandedNames<["testType", { name: "2" & TestBrand }], TestBrand>;
	type NameSet2 = ArrayToSet<["testType"]>;
}

// Test ArrayToSet
{
	type Empty = ArrayToSet<[]>;
	type checkEmpty_ = requireTrue<isAssignableTo<Empty, ReadonlySet<never>>>;
	type check1_ = requireTrue<areSafelyAssignable<ArrayToUnion<[1]>, 1>>;
	type Case2 = ArrayToSet<[1, 2]>;
	type check2_ = requireTrue<areSafelyAssignable<Case2, ReadonlySet<1 | 2>>>;
	type Case3 = ArrayToSet<["testType", "2"]>;
	type check3_ = requireTrue<areSafelyAssignable<Case3, ReadonlySet<"testType" | "2">>>;
}

// Test NameSet
{
	type check1_ = requireAssignableTo<NameSet<["X"]>, NameSet<["X"]>>;
	// @ts-expect-error Different sets should not be equal
	type check3_ = requireAssignableTo<NameSet<["Y"]>, NameSet<["X"]>>;
}
