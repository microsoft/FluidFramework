/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

/**
 * Check if the given value is defined using mocha's `expect`. Return the defined value;
 */
export function expectDefined<T>(value: T | undefined): T {
	assert.notStrictEqual(value, undefined);
	return value as T;
}
