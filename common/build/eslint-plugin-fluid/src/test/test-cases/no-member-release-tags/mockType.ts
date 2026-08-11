/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @public
 */
type ValidMockType = number;

/**
 * @public
 */
type MockType = {
	/**
	 * @public
	 */
	invalidTypePublic: boolean;

	/**
	 * @internal
	 */
	invalidTypeInternal: boolean;

	/**
	 * @alpha
	 */
	invalidTypeAlpha: boolean;

	/**
	 * @beta
	 */
	invalidTypeBeta: number;

	// @public
	invalidTypePublicLine: number;

	validType: number;

	validMethod(): boolean;

	// @internal
	invalidMethod(): boolean;
};
