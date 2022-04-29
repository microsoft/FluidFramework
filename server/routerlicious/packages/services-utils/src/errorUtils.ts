/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export class FluidServiceError extends Error {
    code: FluidServiceErrorCode;
    constructor(message: string, errorCode: FluidServiceErrorCode) {
        super(message);
        this.code = errorCode;
    }
}

export enum FluidServiceErrorCode {
    FeatureDisabled,
}
