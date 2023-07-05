/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeSchemaIdentifier } from "../../../../core";
import {
	ArrayToUnion,
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

// Test Unbrand
{
	type c = Unbrand<"x" & TreeSchemaIdentifier, TreeSchemaIdentifier>;
	type check1_ = requireAssignableTo<"x", c>;
}
