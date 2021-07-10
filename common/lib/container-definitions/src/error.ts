/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Different error types the Container may report out to the Host
 */
export enum ContainerErrorType {
    /**
     * Some error, most likely an exception caught by runtime and propagated to container as critical error
     */
    genericError = "genericError",

    /**
     * Throttling error from server. Server is busy and is asking not to reconnect for some time
     */
    throttlingError = "throttlingError",

    /**
     * Data loss error detected by Container / DeltaManager. Likely points to storage issue.
     */
    dataCorruptionError = "dataCorruptionError",

    /**
     * Error encountered when processing an operation. May correlate with data corruption.
     */
    dataProcessingError = "dataProcessingError",
}

/**
 * Base interface for all errors and warnings at container level
 */
export interface IErrorBase {
    /** errorType is a union of error types from
     * - container
     * - runtime
     * - drivers
     */
    readonly errorType: string;
    readonly message: string;
}

/**
 * Represents warnings raised on container.
 */
export interface ContainerWarning extends IErrorBase {
    /**
     * Whether this error has already been logged. Used to avoid logging errors twice.
     * Default is false.
     */
    logged?: boolean;
}

/**
 * Represents errors raised on container.
 */
export type ICriticalContainerError = IErrorBase;

/**
 * Generic wrapper for an unrecognized/uncategorized error object
 */
export interface IGenericError extends IErrorBase {
    readonly errorType: ContainerErrorType.genericError;
    error?: any;
}

/**
 * Warning emitted when requests to storage are being throttled
 */
export interface IThrottlingWarning extends IErrorBase {
    readonly errorType: ContainerErrorType.throttlingError;
    readonly retryAfterSeconds: number;
}
