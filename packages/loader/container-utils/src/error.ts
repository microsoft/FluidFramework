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

/** Error indicating that a client's session has reached its time limit and is closed. */
export class ClientSessionExpiredError extends LoggingError implements IFluidErrorBase {
    readonly errorType = ContainerErrorType.clientSessionExpiredError;

    constructor(
        readonly fluidErrorCode: string,
        readonly expiryMs: number,
    ) {
        super(fluidErrorCode, { timeoutMs: expiryMs});
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
        readonly fluidErrorCode: string,
        props: ITelemetryProperties,
    ) {
        super(fluidErrorCode, { ...props, dataProcessingError: 1 });
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
    readonly fluidErrorCode = "";
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
        return DataProcessingError.wrapIfUnrecognized(
            new LoggingError(errorMessage, props), // This will be considered an "unrecognized" error
            dataProcessingCodepath,
            sequencedMessage);
    }

    /**
     * Wrap the given error in a DataProcessingError, unless the error is already of a known type.
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
            ...(sequencedMessage === undefined ? undefined : extractSafePropertiesFromMessage(sequencedMessage))
        };

        const normalizedError = normalizeError(originalError, { props });

        // Check for errors that originated externally to our code before being normalized.
        if (normalizedError.errorType === ContainerErrorType.genericError &&
            normalizedError.getTelemetryProperties().untrustedOrigin === 1
        ) {
            // Create a new DataProcessingError using wrapError
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
