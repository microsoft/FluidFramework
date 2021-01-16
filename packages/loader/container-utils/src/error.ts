/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    ContainerErrorType,
    IGenericError,
    ICriticalContainerError,
    IErrorBase,
} from "@fluidframework/container-definitions";
import { LoggingError } from "@fluidframework/telemetry-utils";
import { ITelemetryProperties } from "@fluidframework/common-definitions";

function messageFromError(error: any) {
    if (typeof error?.message === "string") {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return error.message;
    }
    return `${error}`;
}

/**
 * Generic error
 */
export class GenericError extends LoggingError implements IGenericError {
    readonly errorType = ContainerErrorType.genericError;

    constructor(
        errorMessage: string,
        readonly error: any,
    ) {
        super(errorMessage);
    }
}

export class DataCorruptionError extends LoggingError implements IErrorBase {
    readonly errorType = "dataCorruptionError";
    readonly canRetry = false;

    constructor(
        errorMessage: string,
        props: ITelemetryProperties,
    ) {
        super(errorMessage, props);
    }
}

/**
 * Convert the error into one of the error types.
 * @param error - Error to be converted.
 */
export function CreateContainerError(error: any): ICriticalContainerError {
    assert(error !== undefined);

    if (typeof error === "object" && error !== null) {
        const err = error;
        if (error.errorType !== undefined && error instanceof LoggingError) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return err;
        }

        // Only get properties we know about.
        // Grabbing all properties will expose PII in telemetry!
        return new LoggingError(
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
