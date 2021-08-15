/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerErrorType,
    IGenericError,
    IErrorBase,
    IThrottlingWarning,
} from "@fluidframework/container-definitions";
import {
    extractLogSafeErrorProperties,
    LoggingError,
    isValidLegacyError,
    IFluidErrorBase,
    normalizeError,
    hasErrorInstanceId,
} from "@fluidframework/telemetry-utils";
import { ITelemetryLogger, ITelemetryProperties } from "@fluidframework/common-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

/**
 * Generic wrapper for an unrecognized/uncategorized error object
 */
export class GenericError extends LoggingError implements IGenericError, IFluidErrorBase {
    readonly errorType = ContainerErrorType.genericError;

    /**
     * Create a new GenericError
     * @param errorMessage - Error message
     * @param error - inner error object
     * @param props - Telemetry props to include when the error is logged
     */
    constructor(
        readonly fluidErrorCode: string,
        readonly error?: any,
        props?: ITelemetryProperties,
    ) {
        // Don't try to log the inner error
        super(fluidErrorCode, props, new Set(["error"]));
    }
}

/**
 * Warning emitted when requests to storage are being throttled.
 */
export class ThrottlingWarning extends LoggingError implements IThrottlingWarning, IFluidErrorBase {
    readonly errorType = ContainerErrorType.throttlingError;

    constructor(
        message: string,
        readonly fluidErrorCode: string,
        readonly retryAfterSeconds: number,
        props?: ITelemetryProperties,
    ) {
        super(message, props);
    }

    /**
     * Wrap the given error as a ThrottlingWarning, preserving any safe properties for logging
     * and prefixing the wrapped error message with messagePrefix.
     */
    static wrap(error: any, errorCode: string, retryAfterSeconds: number, logger: ITelemetryLogger): IThrottlingWarning {
        const newErrorFn =
            (errMsg: string) => new ThrottlingWarning(errMsg, errorCode, retryAfterSeconds);
        return wrapErrorAndLog(error, newErrorFn, logger);
    }
}

/** Error indicating an API is being used improperly resulting in an invalid operation. */
export class UsageError extends LoggingError implements IFluidErrorBase {
    // TODO: implement IUsageError once available
    readonly errorType = "usageError";

    constructor(
        readonly fluidErrorCode: string,
    ) {
        super(fluidErrorCode, { usageError: true });
    }
}

export class DataCorruptionError extends LoggingError implements IErrorBase, IFluidErrorBase {
    readonly errorType = ContainerErrorType.dataCorruptionError;
    readonly canRetry = false;

    constructor(
        readonly fluidErrorCode: string,
        props: ITelemetryProperties,
    ) {
        super(fluidErrorCode, { ...props, dataProcessingError: 1 });
    }
}

export class DataProcessingError extends LoggingError implements IErrorBase, IFluidErrorBase {
    readonly errorType = ContainerErrorType.dataProcessingError;
    readonly canRetry = false;

    constructor(
        errorMessage: string,
        readonly fluidErrorCode: string,
        props?: ITelemetryProperties,
    ) {
        super(errorMessage, props);
    }

    /**
     * Conditionally coerce the throwable input into a DataProcessingError.
     * @param originalError - Throwable input to be converted.
     * @param message - Sequenced message (op) to include info about via telemetry props
     * @param errorCodeIfNone - pascaleCased code identifying the call site, used if originalError has no error code.
     * @returns Either a new DataProcessingError, or (if wrapping is deemed unnecessary) the given error
     */
    static wrapIfUnrecognized(
        originalError: any,
        errorCodeIfNone: string,
        message: ISequencedDocumentMessage | undefined,
    ): IFluidErrorBase {
        const newErrorFn = (errMsg: string) => {
            const dpe = new DataProcessingError(errMsg, errorCodeIfNone);
            dpe.addTelemetryProperties({ untrustedOrigin: 1}); // To match normalizeError
            return dpe;
        };

        // Don't coerce if already has an errorType, to distinguish unknown errors from
        // errors that we raised which we already can interpret apart from this classification
        const error = isValidLegacyError(originalError) // also accepts valid Fluid Error
            ? normalizeError(originalError, { errorCodeIfNone })
            : wrapError(originalError, newErrorFn);

        error.addTelemetryProperties({ dataProcessingError: 1});
        if (message !== undefined) {
            error.addTelemetryProperties(extractSafePropertiesFromMessage(message));
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
 * Create a new error, wrapping and caused by the given unknown error.
 * Copies the inner error's message and stack over but otherwise uses newErrorFn to define the error.
 * The inner error's instance id will also be logged for telemetry analysis.
 * @param innerError - An error from untrusted/unknown origins
 * @param newErrorFn - callback that will create a new error given the original error's message
 * @returns A new error object "wrapping" the given error
 */
export function wrapError<T extends IFluidErrorBase>(
    innerError: unknown,
    newErrorFn: (message: string) => T,
): T {
    const {
        message,
        stack,
    } = extractLogSafeErrorProperties(innerError, false /* sanitizeStack */);

    const newError = newErrorFn(message);

    if (stack !== undefined) {
        // supposedly setting stack on an Error can throw.
        try {
            Object.assign(newError, { stack });
        } catch (errorSettingStack) {
            newError.addTelemetryProperties({ stack2: stack });
        }
    }

    if (hasErrorInstanceId(innerError)) {
        newError.addTelemetryProperties({ innerErrorInstanceId: innerError.errorInstanceId });
    }

    return newError;
}

/** The same as wrapError, but also logs the innerError, including the wrapping error's instance id */
export function wrapErrorAndLog<T extends IFluidErrorBase>(
    innerError: unknown,
    newErrorFn: (message: string) => T,
    logger: ITelemetryLogger,
) {
    const newError = wrapError(innerError, newErrorFn);
    const wrappedByErrorInstanceId = hasErrorInstanceId(newError)
        ? newError.errorInstanceId
        : undefined;

    logger.sendErrorEvent({
        eventName: "WrapError",
        wrappedByErrorInstanceId,
    }, innerError);

    return newError;
}
