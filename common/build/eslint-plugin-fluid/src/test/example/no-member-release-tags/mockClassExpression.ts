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
	invalidBeta(): void {}

	/**
	 * @public
	 */
	invalidPublic(): void {}

	//@public
	invalidLineComment(): void {}

	// @alpha
	invalidLineSignature: string = "invalidLineSignature";

	/**
	 * @internal
	 */
	inValidSingature: string = "inValidSingature";

	/**
	 * Correctly implemented method with valid comment.
	 */
	validBlockComment(): void {}

	// Correctly implemented method with a line comment.
	validLineComment(): void {}

	validNoComment(): void {}

	validSignature: boolean = false;

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

/**
 * @public
 *
 * Second class expression added to verify that the linter is able to parse multiple class expressions in a single file.
 */
const mockClassExpressionTwo = class {
	/**
	 * @internal
	 */
	invalidInternalTwo(): void {}
};
