/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    ContainerErrorType,
    IGenericError,
    ICriticalContainerError,
    IErrorBase,
} from "@fluidframework/container-definitions";
import { LoggingError, SomeLoggingError } from "@fluidframework/telemetry-utils";
import { ITelemetryProperties } from "@fluidframework/common-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

function messageFromError(error: any): string {
    if (typeof error?.message === "string") {
        return error.message as string;
    }
    return `${error}`;
}

const isValidLoggingError = (error: any): error is LoggingError => {
    return LoggingError.is(error);
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
    if (isValidLoggingError(error)) {
        //* Test this
        if (info !== undefined) {
            error.addTelemetryProperties(info);
        }
        return error;
    } else if (isRegularObject(error)) {
        const safeProps = extractLogSafeErrorProperties(error);

        //* Surprise! errorType from safeProps is overwritten
        return new DataProcessingError(safeProps.message, {
            ...info,
            ...safeProps,
        });
    } else if (typeof error === "string") {
        //* Test this unification/approach. I don't think the const string logged below is useful
        return new DataProcessingError(messageFromError(error), info);
    } else {
        return new DataProcessingError(messageFromError(error), { ...info, typeofWrappedError: typeof error });
    }
}

/**
 * Convert the error into one of the error types.
 * @param error - Error to be converted.
 * @param props - Properties to include on the error object at runtime and when logged
 */
export function CreateContainerError(error: any, props?: ITelemetryProperties): ICriticalContainerError {
    assert(error !== undefined, 0x0f5 /* "Missing error input" */);

    if (isValidLoggingError(error)) {
        if (props !== undefined) {
        error.addTelemetryProperties(props);
        }
        return error;
    } else if (isRegularObject(error)) {
        const {
            message,
            stack,
            errorType,
        } = extractLogSafeErrorProperties(error);

        return new SomeLoggingError(
            errorType ?? ContainerErrorType.genericError,
            message,
            { stack },
        );
    } else if (typeof error === "string") {
        //* Test this and unify cases -- Even merge with above else-if block!
        return new GenericError(messageFromError(error), { typeof: typeof error });
    } else {
        return new GenericError(messageFromError(error), { typeof: typeof error });
    }
}
