/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable: no-unsafe-any
import assert from "assert";
import { ErrorType, IError } from "@microsoft/fluid-driver-definitions";

/**
 * Convert the error into one of the error types.
 * @param error - Error to be converted.
 */
export function createIError(error: any, critical: boolean = false): IError {
    assert(error !== undefined);

    // eslint-disable-next-line no-null/no-null
    if (typeof error === "object" && error !== null) {
        if (Object.isFrozen(error)) {
            return error;
        }
        // If at a later stage we identified that the error is critical, then we will override the previous value.
        if (error.critical !== true) {
            error.critical = critical;
        }
        if (error.errorType === undefined) {
            error.errorType = ErrorType.generalError;
            error.error = error;
        }
        return error;
    } else {
        const specificError: IError = {
            errorType: ErrorType.generalError,
            error,
            critical,
        };
        return specificError;
    }
}
