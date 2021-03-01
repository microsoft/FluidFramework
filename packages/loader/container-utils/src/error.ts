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
import {
    LoggingError,
    DataCorruptionError,
    messageFromError,
    isTypedLoggingError,
    isRegularObject,
    extractLogCompliantErrorProperties,
} from "@fluidframework/telemetry-utils";
import { ITelemetryProperties } from "@fluidframework/common-definitions";

// TODO: replace container-utils refs to DataCorruptionError with telemetry-utils
export { DataCorruptionError };

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
    } else if (isTypedLoggingError(error)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return error as any;
    } else {
        const safeProps = extractLogCompliantErrorProperties(error);

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
        if (isTypedLoggingError(error)) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return err;
        }

        const {
            message,
            stack,
            errorType = `${error.errorType ?? ContainerErrorType.genericError}`,
        } = extractLogCompliantErrorProperties(error);

        return (new LoggingError(message, {
            errorType,
            stack,
        }) as any) as IGenericError;
    } else if (typeof error === "string") {
        return new GenericError(error, new Error(error));
    } else {
        return new GenericError(messageFromError(error), error);
    }
}
