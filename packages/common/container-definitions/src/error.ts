/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryProperties } from "@fluidframework/common-definitions";

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

    /**
     * Error indicating an API is being used improperly resulting in an invalid operation.
     */
    usageError = "usageError",

    /**
     * Error indicating an client session has expired. Currently this only happens when GC is allowed on a document and
     * aids in safely deleting unused objects.
     */
    clientSessionExpiredError = "clientSessionExpiredError",
}

/**
 * Base interface for all errors and warnings at container level
 */
export interface IErrorBase extends Partial<Error> {
    /** errorType is a union of error types from
     * - container
     * - runtime
     * - drivers
     */
    readonly errorType: string;

    /**
     * See Error.message
     * Privacy Note - This is a freeform string that we may not control in all cases (e.g. a dependency throws an error)
     * If there are known cases where this contains privacy-sensitive data it will be tagged and included in the result
     * of getTelemetryProperties. When logging, consider fetching it that way rather than straight from this field.
     */
    readonly message: string;
    /** See Error.name */
    readonly name?: string;
    /** See Error.stack */
    readonly stack?: string;
    /**
     * Returns all properties of this error object that are either safe to log
     * or explicitly tagged as containing privacy-sensitive data.
     */
    getTelemetryProperties?(): ITelemetryProperties;
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
 * Error indicating an API is being used improperly resulting in an invalid operation.
 */
export interface IUsageError extends IErrorBase {
    readonly errorType: ContainerErrorType.usageError;
}

/**
 * Warning emitted when requests to storage are being throttled
 */
export interface IThrottlingWarning extends IErrorBase {
    readonly errorType: ContainerErrorType.throttlingError;
    readonly retryAfterSeconds: number;
}
