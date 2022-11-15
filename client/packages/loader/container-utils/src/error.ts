/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerErrorType,
    IGenericError,
    IErrorBase,
    IThrottlingWarning,
    IUsageError,
} from "@fluidframework/container-definitions";
import {
    LoggingError,
    IFluidErrorBase,
    normalizeError,
    wrapError,
    wrapErrorAndLog,
    isExternalError,
    NORMALIZED_ERROR_TYPE,
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
     * @param message - Error message
     * @param error - inner error object
     * @param props - Telemetry props to include when the error is logged
     */
    constructor(
        message: string,
        readonly error?: any,
        props?: ITelemetryProperties,
    ) {
        // Don't try to log the inner error
        super(message, props, new Set(["error"]));
    }
}

/**
 * Warning emitted when requests to storage are being throttled.
 */
export class ThrottlingWarning extends LoggingError implements IThrottlingWarning, IFluidErrorBase {
    readonly errorType = ContainerErrorType.throttlingError;

    private constructor(
        message: string,
        readonly retryAfterSeconds: number,
        props?: ITelemetryProperties,
    ) {
        super(message, props);
    }

    /**
     * Wrap the given error as a ThrottlingWarning
     * Only preserves the error message, and applies the given retry after to the new warning object
     */
    static wrap(
        error: unknown,
        retryAfterSeconds: number,
        logger: ITelemetryLogger,
    ): IThrottlingWarning {
        const newErrorFn =
            (errMsg: string) => new ThrottlingWarning(errMsg, retryAfterSeconds);
        return wrapErrorAndLog(error, newErrorFn, logger);
    }
}

/** Error indicating an API is being used improperly resulting in an invalid operation. */
export class UsageError extends LoggingError implements IUsageError, IFluidErrorBase {
    readonly errorType = ContainerErrorType.usageError;

    constructor(
        message: string,
    ) {
        super(message, { usageError: true });
    }
}

/** Error indicating that a client's session has reached its time limit and is closed. */
export class ClientSessionExpiredError extends LoggingError implements IFluidErrorBase {
    readonly errorType = ContainerErrorType.clientSessionExpiredError;

    constructor(
        message: string,
        readonly expiryMs: number,
    ) {
        super(message, { timeoutMs: expiryMs });
    }
}

/**
 * DataCorruptionError indicates that we encountered definitive evidence that the data at rest
 * backing this container is corrupted, and this container would never be expected to load properly again
 */
export class DataCorruptionError extends LoggingError implements IErrorBase, IFluidErrorBase {
    readonly errorType = ContainerErrorType.dataCorruptionError;
    readonly canRetry = false;

    constructor(
        message: string,
        props: ITelemetryProperties,
    ) {
        super(message, { ...props, dataProcessingError: 1 });
    }
}

/**
 * DataProcessingError indicates we hit a fatal error while processing incoming data from the Fluid Service.
 * The error will often originate in the dataStore or DDS implementation that is responding to incoming changes.
 * This differs from DataCorruptionError in that this may be a transient error that will not repro in another
 * client or session.
 */
export class DataProcessingError extends LoggingError implements IErrorBase, IFluidErrorBase {
    readonly errorType = ContainerErrorType.dataProcessingError;
    readonly canRetry = false;

    private constructor(errorMessage: string) {
        super(errorMessage);
    }

    /** Create a new DataProcessingError detected and raised with the FF code */
    static create(
        errorMessage: string,
        dataProcessingCodepath: string,
        sequencedMessage?: ISequencedDocumentMessage,
        props: ITelemetryProperties = {},
    ) {
        const dataProcessingError = DataProcessingError.wrapIfUnrecognized(
            errorMessage,
            dataProcessingCodepath,
            sequencedMessage);
        dataProcessingError.addTelemetryProperties(props);

        return dataProcessingError;
    }

    /**
     * Wrap the given error in a DataProcessingError, unless the error is already of a known type
     * with the exception of a normalized LoggingError, which will still be wrapped.
     * In either case, the error will have some relevant properties added for telemetry
     * We wrap conditionally since known error types represent well-understood failure modes, and ideally
     * one day we will move away from throwing these errors but rather we'll return them.
     * But an unrecognized error needs to be classified as DataProcessingError.
     * @param originalError - error to be converted
     * @param dataProcessingCodepath - which codepath failed while processing data
     * @param sequencedMessage - Sequenced message to include info about via telemetry props
     * @returns Either a new DataProcessingError, or (if wrapping is deemed unnecessary) the given error
     */
    static wrapIfUnrecognized(
        originalError: any,
        dataProcessingCodepath: string,
        sequencedMessage?: ISequencedDocumentMessage,
    ): IFluidErrorBase {
        const props = {
            dataProcessingError: 1,
            dataProcessingCodepath,
            ...(sequencedMessage === undefined ? undefined : extractSafePropertiesFromMessage(sequencedMessage)),
        };

        const normalizedError = normalizeError(originalError, { props });
        // Note that other errors may have the NORMALIZED_ERROR_TYPE errorType,
        // but if so they are still suitable to be wrapped as DataProcessingError.
        if (isExternalError(normalizedError) || normalizedError.errorType === NORMALIZED_ERROR_TYPE) {
            // Create a new DataProcessingError to wrap this external error
            const dataProcessingError =
                wrapError(normalizedError, (message: string) => new DataProcessingError(message));

            // Copy over the props above and any others added to this error since first being normalized
            dataProcessingError.addTelemetryProperties(normalizedError.getTelemetryProperties());

            return dataProcessingError;
        }
        return normalizedError;
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
