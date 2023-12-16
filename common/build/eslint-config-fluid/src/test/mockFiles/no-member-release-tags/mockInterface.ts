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
 */
interface MockIntefaceTwo {
	/**
	 * @alpha
	 */
	invalidAlpha: string;

	valid: number;
}
