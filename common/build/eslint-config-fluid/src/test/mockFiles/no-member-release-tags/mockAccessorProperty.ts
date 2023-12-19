/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @public
 * Not used in the current test suite due to compatibility issue with the ESLint.
 */
class MockAccessorProperty {
	private _value = 1;

	/**
	 * @public
	 */
	public get value(): number {
		return this._value;
	}
}
