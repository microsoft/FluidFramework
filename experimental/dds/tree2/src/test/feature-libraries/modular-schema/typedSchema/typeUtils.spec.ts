/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeSchemaIdentifier } from "../../../../core";
import {
	AllowOptional,
	AllowOptionalNotFlattened,
	ArrayToUnion,
	OptionalFields,
	RequiredFields,
	Unbrand,
	WithDefault,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../../../feature-libraries/modular-schema/typedSchema/typeUtils";
import {
	areSafelyAssignable,
	isAssignableTo,
	requireAssignableTo,
	requireTrue,
} from "../../../../util";

// These tests currently just cover the type checking, so its all compile time.

// Test WithDefault
{
	type X2 = WithDefault<undefined, []>;
	type X3 = WithDefault<undefined | 1, 2>;
	type _check = requireAssignableTo<X2, []>;
	type _check2 = requireAssignableTo<X3, 1 | 2>;
}

// Test ArrayToUnion
{
	type Empty = ArrayToUnion<[]>;
	type checkEmpty_ = requireTrue<isAssignableTo<Empty, never>>;
	type check1_ = requireTrue<areSafelyAssignable<ArrayToUnion<[1]>, 1>>;
	type Case2 = ArrayToUnion<[1, 2]>;
	type check2_ = requireTrue<areSafelyAssignable<Case2, 1 | 2>>;
}

// Test RemoveOptionalFields
{
	type a = OptionalFields<{ a: 5; b: undefined | 5; c: undefined }>;
	type check1_ = requireAssignableTo<a, { b?: 5 }>;
	type check2_ = requireAssignableTo<{ b?: 5 }, a>;
}

// Test PartialWithoutUndefined
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

// Test Unbrand
{
	type c = Unbrand<"x" & TreeSchemaIdentifier, TreeSchemaIdentifier>;
	type check1_ = requireAssignableTo<"x", c>;
}
