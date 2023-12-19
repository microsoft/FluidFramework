/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @alpha
 */
const mockClassExpression = class {
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
	inValidBeta(): void {}

	/**
	 * @public
	 */
	inValidPublic(): void {}

	//@public
	invalidLineComment(): void {}

	// @alpha
	invalidLineSignature: string;

	/**
	 * @internal
	 */
	inValidSingature: string;

	/**
	 * Correctly implemented method with valid comment.
	 */
	validBlockComment(): void {}

	// Correctly implemented method with a line comment.
	validLineComment(): void {}

	validNoComment(): void {}

	validSignature: boolean;

	/**
	 * @public
	 */
	constructor() {}

	_value = 1;

	/**
	 * @public
	 */
	public get value(): number {
		return this._value;
	}
};
