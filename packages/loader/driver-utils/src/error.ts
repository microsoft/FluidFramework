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
export function createIError(error: any, critical: boolean = false): IError {
    if (typeof error === "object" && error !== null && Object.isFrozen(error)) {
        return error;
    }
    let specificError;
    if (error instanceof NetworkError || error instanceof ThrottlingError) {
        specificError = {
            ...error.getCustomProperties(),
        };
    } else if (error && error.errorType !== undefined) {
        // If at a later stage we identified that the error is critical, then we will override the previous value.
        if (critical === true && error.critical === false) {
            error.critical = critical;
        }
        return error;
    } else {
        specificError = {
            errorType: ErrorType.generalError,
            error,
        };
    }
    specificError.critical = critical;
    return specificError;
}
