/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable: no-unsafe-any
import * as assert from "assert";
import { ErrorType, IError } from "@microsoft/fluid-driver-definitions";

function messageFromError(error: any) {
    if (typeof error?.toString === "function") {
        return error.toString();
    }
    if (typeof error?.message === "string") {
        return error.message;
    }
    return `${error}`;
}

/**
 * Convert the error into one of the error types.
 * @param error - Error to be converted.
 */
export function createIError(error: any, canRetryArg?: boolean): IError {
    assert(error !== undefined);
    const canRetry = canRetryArg === true;

    // eslint-disable-next-line no-null/no-null
    if (typeof error === "object" && error !== null) {
        const err = Object.create(error);
        // if canRetryArg is passed in, it overwrites actual value in error object
        err.canRetry = canRetry;
        if (error.errorType === undefined) {
            err.errorType = ErrorType.genericError;
            err.message = messageFromError(error);
        }
        return err;
    } else if (typeof error === "string") {
        return {
            errorType: ErrorType.genericError,
            message : error,
            canRetry,
            error: new Error(error),
        };
    } else {
        const specificError: IError = {
            errorType: ErrorType.genericError,
            message: messageFromError(error),
            canRetry,
            error,
        };
        return specificError;
    }
}
