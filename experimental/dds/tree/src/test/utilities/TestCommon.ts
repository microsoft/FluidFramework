/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';

/**
 * Check if the given value is defined using mocha's `expect`. Return the defined value;
 */
export function expectDefined<T>(value: T | undefined): T {
	expect(value).to.be.not.undefined;
	return value as T;
}
