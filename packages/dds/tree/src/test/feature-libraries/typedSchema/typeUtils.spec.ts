/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ArrayToUnion,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../../feature-libraries/typed-schema/typeUtils.js";
import { areSafelyAssignable, isAssignableTo, requireTrue } from "../../../util/index.js";

// These tests currently just cover the type checking, so its all compile time.

// Test ArrayToUnion
{
	type Empty = ArrayToUnion<[]>;
	type checkEmpty_ = requireTrue<isAssignableTo<Empty, never>>;
	type check1_ = requireTrue<areSafelyAssignable<ArrayToUnion<[1]>, 1>>;
	type Case2 = ArrayToUnion<[1, 2]>;
	type check2_ = requireTrue<areSafelyAssignable<Case2, 1 | 2>>;
	type Case3 = ArrayToUnion<number[]>;
	type check3_ = requireTrue<areSafelyAssignable<Case3, number>>;
}
