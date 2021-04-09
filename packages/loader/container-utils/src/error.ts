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
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

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

const isRegularObject = (value: any): boolean => {
    return value !== null && !Array.isArray(value) && typeof value === "object";
};

// TODO: move this elsewhere and use in TelemetryLogger.prepareErrorObject
function extractLogSafeErrorProperties(error: any) {
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
            safeProps.stack = stack;
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

    constructor(errorMessage: string, props?: ITelemetryProperties) {
        super(errorMessage, props);
    }
}

export const extractSafePropertiesFromMessage = (message: ISequencedDocumentMessage)=> ({
        messageClientId: message.clientId,
        messageSequenceNumber: message.sequenceNumber,
        messageClientSequenceNumber: message.clientSequenceNumber,
        messageReferenceSequenceNumber: message.referenceSequenceNumber,
        messageMinimumSequenceNumber: message.minimumSequenceNumber,
        messageTimestamp: message.timestamp,
    });

/**
 * Conditionally coerce the throwable input into a DataProcessingError.
 * @param error - Throwable input to be converted.
 */
export function CreateProcessingError(
    error: any,
    message: ISequencedDocumentMessage | undefined,
): ICriticalContainerError {
    const info = message !== undefined
        ? extractSafePropertiesFromMessage(message)
        : undefined;
    if (typeof error === "string") {
        return new DataProcessingError(error, info);
    } else if (!isRegularObject(error)) {
        return new DataProcessingError(
            "DataProcessingError without explicit message (needs review)",
            { ...info, typeof: typeof error },
        );
    } else if (isValidLoggingError(error)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return error as any;
    } else {
        const safeProps = extractLogSafeErrorProperties(error);

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
    assert(error !== undefined, 0x0f5 /* "Missing error input" */);

    if (typeof error === "object" && error !== null) {
        const err = error;
        if (isValidLoggingError(error)) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return err;
        }

        const {
            message,
            stack,
            errorType = `${error.errorType ?? ContainerErrorType.genericError}`,
        } = extractLogSafeErrorProperties(error);

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
