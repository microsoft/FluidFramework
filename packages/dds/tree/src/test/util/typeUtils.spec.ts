/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { requireAssignableTo } from "../../util/index.js";
import type {
	AllowOptional,
	AllowOptionalNotFlattened,
	OptionalFields,
	RequiredFields,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../util/typeUtils.js";

// These tests currently just cover the type checking, so its all compile time.

// Test OptionalFields
{
	type a = OptionalFields<{ a: 5; b: undefined | 5; c: undefined }>;
	type check1_ = requireAssignableTo<a, { b?: 5 }>;
	type check2_ = requireAssignableTo<{ b?: 5 }, a>;
}

// Test RequiredFields
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
