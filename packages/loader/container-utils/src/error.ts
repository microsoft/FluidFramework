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
import { isILoggingError, LoggingError } from "@fluidframework/telemetry-utils";
import { ITelemetryProperties } from "@fluidframework/common-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

function messageFromError(error: any): string {
    if (typeof error?.message === "string") {
        return error.message as string;
    }
    return String(error);
}

const isValidLoggingError = (error: any): error is LoggingError & IErrorBase => {
    return (typeof error?.errorType === "string") && LoggingError.is(error);
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
 * Create a wrapper for an error of unknown origin
 * @param message - message from innerError (see function messageFromError)
 * @param props - Properties pulled off the error that are safe to log
 * @param innerError - intact error object we are wrapping. Should not be logged as-is
 */
export class GenericError extends LoggingError implements IGenericError {
    readonly errorType = ContainerErrorType.genericError;

    constructor(
        message: string,
        props?: ITelemetryProperties,
        readonly error?: any,
    ) {
        super(message, props);
    }
}

export class ThrottlingWarning extends LoggingError implements IThrottlingWarning {
    readonly errorType = ContainerErrorType.throttlingError;

    constructor(
        message: string,
        readonly retryAfterSeconds: number,
        props?: ITelemetryProperties,
    ) {
        super(message, props);
    }

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

    static wrapIfUnrecognized(
        error: any,
        message: ISequencedDocumentMessage | undefined,
    ): ICriticalContainerError {
        const messagePropsToLog = message !== undefined
            ? extractSafePropertiesFromMessage(message)
            : undefined;

        // Don't coerce if it's already a recognized LoggingError
        if (isValidLoggingError(error)) {
            if (messagePropsToLog !== undefined) {
                error.addTelemetryProperties(messagePropsToLog);
            }
            return error;
        }

        const newErrorFn =
            (errMsg: string, props?: ITelemetryProperties) =>
                new DataProcessingError(errMsg, { ...props, ...messagePropsToLog });

        return wrapError(error, newErrorFn);
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
 * @param error - Throwable input to be converted.
 */
export const CreateProcessingError = DataProcessingError.wrapIfUnrecognized;

/**
 * Convert the error into one of the error types.
 * @param error - Error to be converted.
 * @param props - Properties to include on the error object at runtime and when logged
 */
export function CreateContainerError(error: any, props?: ITelemetryProperties): ICriticalContainerError {
    if (isValidLoggingError(error)) {
        if (props !== undefined) {
            error.addTelemetryProperties(props);
        }
        return error;
    }

    const { errorType } = extractLogSafeErrorProperties(error);
    const newErrorFn =
        (errMsg: string, props2?: ITelemetryProperties) =>{
            const newError = new GenericError(
                errMsg,
                { ...props, ...props2 },
                error,
            );
            if (errorType !== undefined) {
                Object.assign(newError, { errorType });
            }

            // By clobbering newError.errorType, we can no longer properly call it a GenericError.
            // It's still a LoggingError, and does have errorType so it's also IErrorBase
            return newError as LoggingError & IErrorBase;
        };

    return wrapError(error, newErrorFn);
}

/**
 * This function allows us to take an unknown error object and extract certain known
 * properties to be included in a new error object.
 * The stack is preserved, along with any safe-to-log telemetry props.
 * @param error - An existing error that was presumably caught, thrown from unknown origins
 * @param newErrorFn - callback that will create a new error wrapping the given error
 * @returns A new error object "wrapping" the given error
 */
export function wrapError<T extends LoggingError>(
    error: any,
    newErrorFn: (m: string, p?: ITelemetryProperties) => T,
): T {
    const {
        message,
        stack,
    } = extractLogSafeErrorProperties(error);
    const props = isILoggingError(error) ? error.getTelemetryProperties() : {};

    const newError = newErrorFn(message, props);
    if (stack !== undefined) {
        Object.assign(newError, { stack });
    }

    return newError;
}
