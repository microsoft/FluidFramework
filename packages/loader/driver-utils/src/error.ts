/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable: no-unsafe-any
import * as assert from "assert";
import { ErrorType, IError, IGenericError } from "@microsoft/fluid-driver-definitions";

function messageFromError(error: any) {
    if (typeof error?.message === "string") {
        return error.message;
    }
    return `${error}`;
}

export class ErrorWithProps extends Error {
    constructor(message: string) {
        super(message);
    }

    // Return all properties
    public getCustomProperties(): object {
        const props = {};
        // Could not use {...this} because it does not return properties of base class.
        for (const key of Object.getOwnPropertyNames(this)) {
            props[key] = this[key];
        }
        return props;
    }
}

/**
 * Generic error
 */
class GenericError extends ErrorWithProps implements IGenericError {
    readonly errorType = ErrorType.genericError;

    constructor(
        errorMessage: string,
        readonly canRetry: boolean,
        readonly error: any,
    ) {
        super(errorMessage);
    }
}

/**
 * Convert the error into one of the error types.
 * @param error - Error to be converted.
 */
export function createIError(error: any, canRetryArg?: boolean): IError {
    assert(error !== undefined);

    // default is false
    const canRetry = canRetryArg === true;

    // eslint-disable-next-line no-null/no-null
    if (typeof error === "object" && error !== null) {
        const err = error;
        if (error.errorType !== undefined && error instanceof ErrorWithProps) {
            if (canRetryArg === undefined || err.canRetry === canRetryArg) {
                return err;
            }

            // we trust it to not have any PI!!
            // Only overwrite canRetry if specified
            return Object.assign(
                Object.create(error),
                { canRetry: canRetryArg },
            );
        }

        // Only get properties we know about.
        // Grabbing all properties will expose PII in telemetry!
        return Object.assign(
            new ErrorWithProps(messageFromError(error)),
            {
                errorType: error.errorType ?? ErrorType.genericError,
                canRetry: canRetryArg ?? (error.canRetry ?? false),
                stack: error.stack,
            },
        );
    } else if (typeof error === "string") {
        return new GenericError(error, canRetry, new Error(error));
    } else {
        return new GenericError(messageFromError(error), canRetry, error);
    }
}
