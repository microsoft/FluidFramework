/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
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
    /** Sequence number when error happened */
    sequenceNumber?: number;
}

/**
 * Represents warnings raised on container.
 */
export type ContainerWarning = IErrorBase;

/**
 * Represents errors raised on container.
 */
export type ICriticalContainerError = IErrorBase;

/**
 * Generic container error
 */
export interface IGenericError extends IErrorBase {
    readonly errorType: ContainerErrorType.genericError;
    error?: any;
}

/**
 * Throttling container error
 */
export interface IThrottlingWarning extends IErrorBase {
    readonly errorType: ContainerErrorType.throttlingError;
    readonly retryAfterSeconds: number;
}
