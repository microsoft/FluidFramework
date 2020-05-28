/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable: no-unsafe-any
import assert from "assert";
import { ErrorType, IGenericError } from "@fluidframework/container-definitions";

function messageFromError(error: any) {
    if (typeof error?.message === "string") {
        return error.message;
    }
    return `${error}`;
}

/**
 * TODO: Needs to be removed and replaced with version in logger.ts
 * Please use version in @fluidframework/common-util package!
 *
 * Helper class for error tracking.
 * Object of this instance will record all of their properties when logged with logger.
 * Care needs to be taken not to log PII information!
 * Logger ignores all properties from any  other error objects (not being instance of CustomErrorWithProps),
 * with exception of 'message' & 'stack' properties if they exists on error object.
 * In other words, logger logs only what it knows about and has good confidence it does not container PII information.
 */
export class CustomErrorWithProps extends Error {
    constructor(
        message: string,
        props?: {[key: string]: string | number})
    {
        super(message);
        Object.assign(this, props);
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
class GenericError extends CustomErrorWithProps implements IGenericError {
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
export function CreateContainerError(error: any, canRetryArg?: boolean): IGenericError {
    assert(error !== undefined);

    // default is false
    const canRetry = canRetryArg === true;

    // eslint-disable-next-line no-null/no-null
    if (typeof error === "object" && error !== null) {
        const err = error;
        if (error.errorType !== undefined && error instanceof CustomErrorWithProps) {
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
        return new CustomErrorWithProps(
            messageFromError(error),
            {
                errorType: error.errorType ?? ErrorType.genericError,
                canRetry: canRetryArg ?? (error.canRetry ?? false),
                stack: error.stack,
            },
        ) as any as IGenericError;
    } else if (typeof error === "string") {
        return new GenericError(error, canRetry, new Error(error));
    } else {
        return new GenericError(messageFromError(error), canRetry, error);
    }
}
