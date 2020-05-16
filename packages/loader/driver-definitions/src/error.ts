/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable: no-unsafe-any
export enum ErrorType {
    /**
     * Some error, most likely an exception caught by runtime and propagated to container as critical error
     */
    generalError,

    /**
    // Some non-categorized (below) networking error
     */
    genericNetworkError,

    /**
    // Access denied - user does not have enough privileges to open a file, or continue to operate on a file
     */
    authorizationError,

    /**
    // File not found, or file deleted during session
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
    * Service error. Not used
     */
    serviceError,

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
    * Some fatal server error (usually 500).
     */
    fatalError,
}

export type IError = IGeneralError | IThrottlingError | IOutOfStorageError | IInvalidFileNameError |
IGenericNetworkError | IAuthorizationError | IFileNotFoundOrAccessDeniedError |
IServiceError | ISummarizingError | IWriteError | IFatalError;

export interface IErrorBase {
    readonly errorType: ErrorType;
    readonly message: string;
    readonly canRetry: boolean;
    readonly online?: string;
}

export interface IGeneralError extends IErrorBase {
    readonly errorType: ErrorType.generalError;
    error: any;
}

export interface IThrottlingError extends IErrorBase {
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

export interface IServiceError extends IErrorBase {
    readonly errorType: ErrorType.serviceError;
}

export interface ISummarizingError extends IErrorBase {
    readonly errorType: ErrorType.summarizingError;
    readonly description: string;
    /**
     * Whether this error has already been logged. Used to avoid logging errors twice.
     */
    readonly logged?: boolean;
}

export interface IWriteError extends IErrorBase {
    readonly errorType: ErrorType.writeError;
}

export interface IFatalError extends IErrorBase {
    readonly errorType: ErrorType.fatalError;
}
