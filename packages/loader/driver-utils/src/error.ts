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
export function createIError(error: any): IError {
    assert(error !== undefined);

    // eslint-disable-next-line no-null/no-null
    if (typeof error === "object" && error !== null) {
        if (error.errorType === undefined) {
            return {
                ...error,
                canRetry: false,
                errorType: ErrorType.generalError,
                message: error.message ?? `${error}`,
            };
        }
        return error;
    } else if (typeof error === "string") {
        return {
            errorType: ErrorType.generalError,
            message : error,
            canRetry: false,
            error: new Error(error),
        };
    } else {
        const specificError: IError = {
            errorType: ErrorType.generalError,
            message: `${error}`,
            canRetry: false,
            error,
        };
        return specificError;
    }
}
