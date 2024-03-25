/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @public
 */
class MockClass {
	/**
	 * @internal
	 */
	invalidInternal(): void {}

	/**
	 * @alpha
	 */
	invalidAlpha(): void {}

	/**
	 * @beta
	 */
	invalidBeta(): void {}

	/**
	 * @public
	 */
	invalidPublic(): void {}

	//@public
	invalidLineComment(): void {}

	/**
	 * Correctly implemented method with valid comment.
	 */
	validBlockComment(): void {}

	// Correctly implemented method with a line comment.
	validLineComment(): void {}

	validNoComment(): void {}

	signature: string;

	private _value = 1;

	/**
	 * @public
	 */
	public get value(): number {
		return this._value;
	}

	/**
	 * @public
	 */
	constructor() {}
}

/**
 * @public
 *
 * Second class added to verify that the linter is able to parse multiple classes in a single file.
 */
class MockClassTwo {
	/**
	 * @internal
	 */
	invalidInternalTwo(): void {}

	// Valid property signature.
	validSignature: void;
}
