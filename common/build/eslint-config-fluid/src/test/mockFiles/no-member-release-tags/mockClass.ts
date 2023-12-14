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
	inValidBeta(): void {}

	/**
	 * @public
	 */
	inValidPublic(): void {}

	//@public
	invalidLineComment(): void {}

	/**
	 * Correctly implemented method with valid comment.
	 */
	validBlockComment(): void {}

	// Correctly implemented method with a slash comment.
	validLineComment(): void {}

	validNoComment(): void {}
}

/**
 * @public
 */
class MockClassTwo {
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

	/**
	 * Correctly implemented method with valid comment.
	 */
	validBlockComment(): void {}

	// Correctly implemented method with a slash comment.
	validLineComment(): void {}

	validNoComment(): void {}
}
