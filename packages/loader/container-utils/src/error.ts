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
    LoggingError,
    isValidLegacyError,
    IFluidErrorBase,
    normalizeError,
    wrapError,
    wrapErrorAndLog,
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
    static wrap(
        error: any,
        errorCode: string,
        retryAfterSeconds: number,
        logger: ITelemetryLogger,
    ): IThrottlingWarning {
        const newErrorFn =
            (errMsg: string) => new ThrottlingWarning(errMsg, errorCode, retryAfterSeconds);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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
     * @param dataProcessingCodepath - which codepath failed while processing data.
     * @returns Either a new DataProcessingError, or (if wrapping is deemed unnecessary) the given error
     */
    static wrapIfUnrecognized(
        originalError: any,
        dataProcessingCodepath: string,
        message?: ISequencedDocumentMessage,
    ): IFluidErrorBase {
        const newErrorFn = (errMsg: string) => {
            const dpe = new DataProcessingError(errMsg, "" /* fluidErrorCode */);
            dpe.addTelemetryProperties({ untrustedOrigin: 1}); // To match normalizeError
            return dpe;
        };

        // Don't coerce if already has an errorType, to distinguish unknown errors from
        // errors that we raised which we already can interpret apart from this classification
        const error = isValidLegacyError(originalError) // also accepts valid Fluid Error
            ? normalizeError(originalError)
            : wrapError(originalError, newErrorFn);

        error.addTelemetryProperties({
            dataProcessingError: 1,
            dataProcessingCodepath,
        });
        if (message !== undefined) {
            error.addTelemetryProperties(extractSafePropertiesFromMessage(message));
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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
