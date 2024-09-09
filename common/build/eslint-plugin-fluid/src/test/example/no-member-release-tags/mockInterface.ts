/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @internal
 */
interface MockInteface {
	/**
	 * @alpha
	 */
	invalidAlpha: string;

	/**
	 * @beta
	 */
	invalidBeta: string;

	/**
	 * @public
	 */
	invalidPublic: string;

	/**
	 * @internal
	 */
	invalidInternal: number;

	// @internal
	invalidInternalLine: number;

	// This should be a valid implementation.
	validComment: number;

	valid: number;

	validFunction(): boolean;

	/**
	 * @public
	 */
	invalidFunction(): boolean;
}

/**
 * @public
 *
 * Second interface added to verify that the linter is able to parse multiple interfaces in a single file.
 */
interface MockIntefaceTwo {
	/**
	 * @alpha
	 */
	invalidAlphaTwo: string;

	validSignature: number;
}
