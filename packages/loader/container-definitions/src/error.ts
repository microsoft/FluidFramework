/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable: no-unsafe-any
export enum ErrorType {
    /**
     * Some error, most likely an exception caught by runtime and propagated to container as critical error
     */
    genericError,

    /**
     * Some non-categorized (below) networking error
     * Include errors like  fatal server error (usually 500).
     */
    genericNetworkError,

    /**
     * Access denied - user does not have enough privileges to open a file, or continue to operate on a file
     */
    authorizationError,

    /**
     * File not found, or file deleted during session
     */
    fileNotFoundOrAccessDeniedError,

    /**
     * Storage is out of space
     */
    outOfStorageError,

    /**
     * Invalid file name (at creation of the file)
     */
    invalidFileNameError,

    /**
     * Throttling error from server. Server is busy and is asking not to reconnect for some time
     */
    throttlingError,

    /**
     * Summarizing error. Currently raised on summarizing container only.
     * Work is planned to propagate these errors to main container.
     */
    summarizingError,

    /**
     * User does not have write permissions to a file, but is changing content of a file.
     * That might be indication of some component error - components should not generate ops in readonly mode.
     */
    writeError,

    /**
     * We can not reach server due to computer being offline.
     */
    offlineError,
}

/**
 * List of errors that can be either critical errors or warnings.
 * This list should be very short.
 * Throttling error is an example of that - we will fail container load
 * if throttling error is returned while loading initial snapshot, but in all
 * other cases it's just a warning.
 */
export type ContainerErrorOrWarning = IThrottlingWarning;

/**
 * List of errors that could be critical and can close container.
 * Severity is determined by 'canRetry' property, as well as where error is raised.
 * For example, almost all errors resulting from "disconnect" or "error" handlers on
 * delta connection are considered to be noncritical, ignoring 'canRetry' property.
 */
export type CriticalContainerError =
    IGenericError | ContainerErrorOrWarning |
    IOutOfStorageError | IInvalidFileNameError |
    IAuthorizationError | IFileNotFoundOrAccessDeniedError |
    IWriteError | IGenericNetworkError | IOfflineError;

/**
 * List of warnings raised on container that are not critical.
 * Hosts may want to expose them in some form to users, or may skip.
 */
export type ContainerWarning =
    ContainerErrorOrWarning |
    ISummarizingWarning;

/**
 * Base interface for all errors and warnings
 */
export interface IErrorBase {
    readonly errorType: ErrorType;
    readonly message: string;
    readonly canRetry: boolean;
    readonly online?: string;
}

export interface IGenericError extends IErrorBase {
    readonly errorType: ErrorType.genericError;
    error: any;
}

export interface IThrottlingWarning extends IErrorBase {
    readonly errorType: ErrorType.throttlingError;
    readonly retryAfterSeconds: number;
}

export interface IGenericNetworkError extends IErrorBase {
    readonly errorType: ErrorType.genericNetworkError;
    readonly statusCode?: number;
}

export interface IAuthorizationError extends IErrorBase {
    readonly errorType: ErrorType.authorizationError;
}

export interface IFileNotFoundOrAccessDeniedError extends IErrorBase {
    readonly errorType: ErrorType.fileNotFoundOrAccessDeniedError;
}

export interface IOutOfStorageError extends IErrorBase {
    readonly errorType: ErrorType.outOfStorageError;
}

export interface IInvalidFileNameError extends IErrorBase {
    readonly errorType: ErrorType.invalidFileNameError;
}

export interface ISummarizingWarning extends IErrorBase {
    readonly errorType: ErrorType.summarizingError;
    /**
     * Whether this error has already been logged. Used to avoid logging errors twice.
     */
    readonly logged: boolean;
}

export interface IWriteError extends IErrorBase {
    readonly errorType: ErrorType.writeError;
}

export interface IOfflineError extends IErrorBase {
    readonly errorType: ErrorType.offlineError;
}
