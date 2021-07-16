/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerErrorType,
    IGenericError,
    ICriticalContainerError,
    IErrorBase,
    IThrottlingWarning,
} from "@fluidframework/container-definitions";
import { wrapError, annotateError, LoggingError } from "@fluidframework/telemetry-utils";
import { ITelemetryProperties } from "@fluidframework/common-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

/** type guard to ensure it has an errorType e.g. via IErrorBase */
const hasErrorType = (error: any): error is IErrorBase => {
    return (typeof error?.errorType === "string");
};

/**
 * Generic wrapper for an unrecognized/uncategorized error object
 */
export class GenericError extends LoggingError implements IGenericError {
    readonly errorType = ContainerErrorType.genericError;

    /**
     * Create a new GenericError
     * @param errorMessage - Error message
     * @param error - inner error object
     * @param props - Telemetry props to include when the error is logged
     */
    constructor(
        errorMessage: string,
        readonly error?: any,
        props?: ITelemetryProperties,
    ) {
        super(errorMessage, props);
    }
}

/**
 * Warning emitted when requests to storage are being throttled.
 */
export class ThrottlingWarning extends LoggingError implements IThrottlingWarning {
    readonly errorType = ContainerErrorType.throttlingError;

    constructor(
        message: string,
        readonly retryAfterSeconds: number,
        props?: ITelemetryProperties,
    ) {
        super(message, props);
    }

    /**
     * Wrap the given error as a ThrottlingWarning, preserving any safe properties for logging
     * and prefixing the wrapped error message with messagePrefix.
     */
    static wrap(error: any, messagePrefix: string, retryAfterSeconds: number): IThrottlingWarning {
        const newErrorFn =
            (errMsg: string) =>
                new ThrottlingWarning(`${messagePrefix}: ${errMsg}`, retryAfterSeconds);
        return wrapError(error, newErrorFn);
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

    /**
     * Conditionally coerce the throwable input into a DataProcessingError.
     * @param originalError - Throwable input to be converted.
     * @param message - Sequenced message (op) to include info about via telemetry props
     * @returns Either a new DataProcessingError, or (if wrapping is deemed unnecessary) the given error
     */
    static wrapIfUnrecognized(
        originalError: any,
        message: ISequencedDocumentMessage | undefined,
    ): ICriticalContainerError {
        const newErrorFn = (errMsg: string) => new DataProcessingError(errMsg);

        // Don't coerce if already has an errorType, to distinguish unknown errors from
        // errors that we raised which we already can interpret apart from this classification
        const error = hasErrorType(originalError)
            ? originalError
            : wrapError(originalError, newErrorFn);

        if (message !== undefined) {
            annotateError(error, extractSafePropertiesFromMessage(message));
        }
        return error;
    }
}

export const extractSafePropertiesFromMessage = (message: ISequencedDocumentMessage) => ({
        messageClientId: message.clientId,
        messageSequenceNumber: message.sequenceNumber,
        messageClientSequenceNumber: message.clientSequenceNumber,
        messageReferenceSequenceNumber: message.referenceSequenceNumber,
        messageMinimumSequenceNumber: message.minimumSequenceNumber,
        messageTimestamp: message.timestamp,
    });

/**
 * Conditionally coerce the throwable input into a DataProcessingError.
 */
export const CreateProcessingError = DataProcessingError.wrapIfUnrecognized;

/**
 * Convert the error into one of the error types.
 * @param originalError - Error to be converted.
 * @param props - Properties to include on the error for logging - They will override props on originalError
 */
export function CreateContainerError(originalError: any, props?: ITelemetryProperties): ICriticalContainerError {
    const newErrorFn = (errMsg: string) => new GenericError(errMsg, originalError);

    const error = hasErrorType(originalError)
        ? originalError
        : wrapError(originalError, newErrorFn);

    if (props !== undefined) {
        annotateError(error, props);
    }
    return error;
}
