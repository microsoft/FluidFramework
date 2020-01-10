/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable: no-unsafe-any
import { ErrorType, IError } from "@microsoft/fluid-driver-definitions";
import { NetworkError, ThrottlingError } from "./network";

/**
 * Convert the error into one of the error types.
 * @param error - Error to be converted.
 */
export function createContainerError(error: any): IError {
    let specificError;
    if (error instanceof NetworkError || error instanceof ThrottlingError) {
        specificError = {
            ...error.getCustomProperties(),
        };
    } else {
        specificError = {
            type: ErrorType.generalError,
            error,
        };
    }
    return specificError;
}
