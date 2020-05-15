/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable: no-unsafe-any
import * as assert from "assert";
import { ErrorType, IError } from "@microsoft/fluid-driver-definitions";

/**
 * Convert the error into one of the error types.
 * @param error - Error to be converted.
 */
export function createIError(error: any, canRetryArg?: boolean): IError {
    assert(error !== undefined);
    const canRetry = canRetryArg === true;

    // eslint-disable-next-line no-null/no-null
    if (typeof error === "object" && error !== null) {
        // if canRetryArg is passed in, it overwrites actual value in error object
        if (error.errorType === undefined || canRetryArg !== undefined) {
            return {
                errorType: ErrorType.generalError,
                message: `${error}`,
                ...error,
                canRetry,
            };
        }
        return error;
    } else if (typeof error === "string") {
        return {
            errorType: ErrorType.generalError,
            message : error,
            canRetry,
            error: new Error(error),
        };
    } else {
        const specificError: IError = {
            errorType: ErrorType.generalError,
            message: `${error}`,
            canRetry,
            error,
        };
        return specificError;
    }
}
