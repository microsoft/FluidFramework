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

function messageFromError(error: any): string {
    if (typeof error?.message === "string") {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return error.message;
    }
    return `${error}`;
}

const isValidLoggingError = (error: any): error is LoggingError => {
    return typeof error?.errorType === "string" && error instanceof LoggingError;
};

const isRegularObject = (value: any): boolean => value !== null || Array.isArray(value) || typeof value !== "object";

function extractSafeLoggableProperties(error: any) {
    // Only get properties we know about.
    // Grabbing all properties will expose PII in telemetry!
    const message = messageFromError(error);
    const safeProps: { message: string; errorType?: string; stack?: string } = {
        message,
    };

    if (isRegularObject(error)) {
        const { errorType, stack } = error;

        if (typeof errorType === "string") {
            safeProps.errorType = errorType;
        }

        if (typeof stack === "string") {
            safeProps.stack = errorType;
        }
    }

    return safeProps;
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
    readonly canRetry = false;

    constructor(errorMessage: string, props: ITelemetryProperties) {
        super(errorMessage, props);
    }
}

export class DataProcessingError extends LoggingError implements IErrorBase {
    readonly errorType = ContainerErrorType.dataProcessingError;
    readonly canRetry = false;

    constructor(errorMessage: string, props: ITelemetryProperties) {
        super(errorMessage, props);
    }
}

/**
 * Conditionally coerce the throwable input into a DataProcessingError.
 * @param error - Throwable input to be converted.
 */
export function CreateProcessingError(
    error: any,
    info: Partial<{
        clientId: string;
        messageClientId: string;
        sequenceNumber: number;
        clientSequenceNumber: number;
        referenceSequenceNumber: number;
        minimumSequenceNumber: number;
        messageTimestamp: number;
    }> = {},
): ICriticalContainerError {
    if (typeof error === "string") {
        return new DataProcessingError(error, { ...info });
    } else if (!isRegularObject(error)) {
        return new DataProcessingError(
            "DataProcessingError without explicit message (needs review)",
            { ...info, typeof: typeof error },
        );
    } else if (isValidLoggingError(error)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return error as any;
    } else {
        const safeProps = extractSafeLoggableProperties(error);

        return new DataProcessingError(safeProps.message, {
            ...info,
            ...safeProps,
            errorType: ContainerErrorType.dataProcessingError,
        });
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
        if (isValidLoggingError(error)) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return err;
        }

        const safeProps = extractSafeLoggableProperties(error);
        return (new LoggingError(
            safeProps.message,
            safeProps,
        ) as any) as IGenericError;
    } else if (typeof error === "string") {
        return new GenericError(error, new Error(error));
    } else {
        return new GenericError(messageFromError(error), error);
    }
}
