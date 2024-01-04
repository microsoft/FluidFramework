/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @internal
 */
export class FluidServiceError extends Error {
	code: FluidServiceErrorCode;
	constructor(message: string, errorCode: FluidServiceErrorCode) {
		super(message);
		this.code = errorCode;
	}
}

/**
 * @internal
 */
export enum FluidServiceErrorCode {
	FeatureDisabled,
}
