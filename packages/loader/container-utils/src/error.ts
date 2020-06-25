/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable: no-unsafe-any
import assert from "assert";
import { ContainerErrorType, IGenericError, ICriticalContainerError } from "@fluidframework/container-definitions";
import { CustomErrorWithProps } from "@fluidframework/telemetry";

function messageFromError(error: any) {
    if (typeof error?.message === "string") {
        return error.message;
    }
    return `${error}`;
}

/**
 * Generic error
 */
class GenericError extends CustomErrorWithProps implements IGenericError {
    readonly errorType = ContainerErrorType.genericError;

    constructor(
        errorMessage: string,
        readonly error: any,
    ) {
        super(errorMessage);
    }
}

/**
 * Convert the error into one of the error types.
 * @param error - Error to be converted.
 */
export function CreateContainerError(error: any): ICriticalContainerError {
    assert(error !== undefined);

    // eslint-disable-next-line no-null/no-null
    if (typeof error === "object" && error !== null) {
        const err = error;
        if (error.errorType !== undefined && error instanceof CustomErrorWithProps) {
            return err;
        }

        // Only get properties we know about.
        // Grabbing all properties will expose PII in telemetry!
        return new CustomErrorWithProps(
            messageFromError(error),
            {
                errorType: error.errorType ?? ContainerErrorType.genericError,
                stack: error.stack,
            },
        ) as any as IGenericError;
    } else if (typeof error === "string") {
        return new GenericError(error, new Error(error));
    } else {
        return new GenericError(messageFromError(error), error);
    }
}
