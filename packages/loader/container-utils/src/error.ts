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
        props?: ITelemetryProperties,
    ) {
        super(errorMessage, props);
    }
}

export class DataCorruptionError extends LoggingError implements IErrorBase {
    readonly errorType = ContainerErrorType.dataCorruptionError;
    readonly errorSubType?: string;
    readonly canRetry = false;

    constructor(
        errorMessage: string,
        props: ITelemetryProperties,
    ) {
        super(errorMessage, props);
    }
}

/**
 * Coerce the throwable input into a DataCorruptionError.
 * @param error - Throwable input to be converted.
 */
export function CreateCorruptionError(
    error: any,
    info: Partial<{
        clientId: string,
        messageClientId: string,
        sequenceNumber: number,
        clientSequenceNumber: number,
        referenceSequenceNumber: number,
        minimumSequenceNumber: number,
        messageTimestamp: number,
    }> = {},
): DataCorruptionError {
    if (typeof error === "string") {
        return new DataCorruptionError(error, { ...info });
    } else if (!error || Array.isArray(error) || typeof error !== "object") {
        return new DataCorruptionError(
            "DataCorruptionError without explicit message (needs review)",
            { ...info, typeof: typeof error },
        );
    } else if (error instanceof DataCorruptionError) {
        return Object.assign(error, { ...info, ...error });
    } else if (error instanceof LoggingError) {
        const { errorType: errorSubType } = error as any;

        return new DataCorruptionError(
            error.message,
            errorSubType
                ? {
                    ...info,
                    ...error,
                    errorSubType,
                    errorType: ContainerErrorType.dataCorruptionError,
                }
                : {
                    ...info,
                    ...error,
                    errorType: ContainerErrorType.dataCorruptionError,
                },
        );
    } else {
        // Only get properties we know about.
        // Grabbing all properties will expose PII in telemetry!
        const message = messageFromError(error);
        const { stack } = error;

        return stack
            ? new DataCorruptionError(message, { ...info, stack })
            : new DataCorruptionError(message, { ...info });
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
