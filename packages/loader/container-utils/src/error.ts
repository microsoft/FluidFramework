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
import {
    isILoggingError,
    extractLogSafeErrorProperties,
    LoggingError,
    IWriteableLoggingError,
    isValidLegacyError,
    IFluidErrorBase,
    normalizeError,
} from "@fluidframework/telemetry-utils";
import { ITelemetryProperties } from "@fluidframework/common-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

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
        // Don't try to log the inner error
        super(errorMessage, props, new Set(["error"]));
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

export const extractSafePropertiesFromMessage = (message: ISequencedDocumentMessage) => ({
        messageClientId: message.clientId,
        messageSequenceNumber: message.sequenceNumber,
        messageClientSequenceNumber: message.clientSequenceNumber,
        messageReferenceSequenceNumber: message.referenceSequenceNumber,
        messageMinimumSequenceNumber: message.minimumSequenceNumber,
        messageTimestamp: message.timestamp,
    });

/**
 * Normalize the throwable input into a Fluid Error annotated as a DataProcessingError.
 * @param originalError - Potentially untrusted error to be converted/annotated.
 * @param errorCodeIfNone - errorCode identifying the call site, to be used if the originalError has no error code.
 * @param message - Sequenced message (op) to include info about via telemetry props
 * @returns An error annotated as dataProcessingError in a variety of ways to support telemetry analysis
 */
export function CreateProcessingError(
    originalError: unknown,
    errorCodeIfNone: string,
    message: ISequencedDocumentMessage | undefined,
): IFluidErrorBase {
    // Temp back-compat for Telemetry systems expecting the errorType to be dataProcessingError
    const overrideNormalizedErrorCode = !isValidLegacyError(originalError);

    const error = normalizeError(originalError, {
        errorCodeIfNone,
        props: { dataProcessingError: 1 },
    });

    // canRetry is a property that various code checks for.  Should be false in this case.
    Object.assign(error, { canRetry: false });

    if (overrideNormalizedErrorCode) {
        Object.assign(error, { errorType: ContainerErrorType.dataProcessingError });
    }

    if (message !== undefined) {
        error.addTelemetryProperties(extractSafePropertiesFromMessage(message));
    }

    return error;
}

/**
 * Convert the error into one of the error types.
 * @param originalError - Error to be converted.
 * @param props - Properties to include on the error for logging - They will override props on originalError
 */
export function CreateContainerError(originalError: any, props?: ITelemetryProperties): ICriticalContainerError {
    const newErrorFn =
        (errMsg: string) => {
            // Don't pass in props here, we want to add them last (see below)
            const newError = new GenericError(errMsg, originalError);

            const { errorType } = extractLogSafeErrorProperties(originalError, false /* sanitizeStack */);
            if (errorType !== undefined) {
                // Clobber errorType (which is declared readonly) with the value off the original error
                Object.assign(newError, { errorType });
            }

            // By clobbering newError.errorType, we can no longer properly call it a GenericError.
            // It's still a LoggingError, and does have errorType so it's also IErrorBase
            return newError as LoggingError & IErrorBase;
        };

    const error = isValidLegacyError(originalError)
        ? originalError
        : wrapError(originalError, newErrorFn);

    if (props !== undefined) {
        error.addTelemetryProperties(props);
    }
    return error;
}

/**
 * Take an unknown error object and extract certain known properties to be included in a new error object.
 * The stack is preserved, along with any safe-to-log telemetry props.
 * @param error - An error that was presumably caught, thrown from unknown origins
 * @param newErrorFn - callback that will create a new error given the original error's message
 * @returns A new error object "wrapping" the given error
 */
export function wrapError<T extends IWriteableLoggingError>(
    error: any,
    newErrorFn: (m: string) => T,
): T {
    const {
        message,
        stack,
    } = extractLogSafeErrorProperties(error, false /* sanitizeStack */);
    const props = isILoggingError(error) ? error.getTelemetryProperties() : {};

    const newError = newErrorFn(message);
    newError.addTelemetryProperties(props);

    if (stack !== undefined) {
        Object.assign(newError, { stack });
    }

    return newError;
}
