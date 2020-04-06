/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable: no-unsafe-any
export enum ErrorType {
    // Some error, most likely an exception caught by runtime and propagated to container as critical error
    generalError,

    // Some non-categorized (below) networking error
    genericNetworkError,

    // Access denied - user does not have enough privileges to open a file, or continue to operate on a file
    accessDeniedError,

    // File not found, or file deleted during session
    fileNotFoundError,

    // Throttling error from server. Server is busy and is asking not to reconnect for some time
    throttlingError,

    // Service error. Not used
    serviceError,

    // Summarizing error. Currently raised on summarizing container only.
    // Work is planned to propagate these errors to main container.
    summarizingError,

    // User does not have write permissions to a file, but is changing content of a file.
    // That might be indication of some component error - components should not generate ops in readonly mode.
    writeError,

    // Some fatal server error (usually 500).
    fatalError,
}

export type IError = IGeneralError | IThrottlingError |
IGenericNetworkError | IAccessDeniedError | IFileNotFoundError |
IServiceError | ISummarizingError | IWriteError | IFatalError;

export interface IGeneralError {
    readonly errorType: ErrorType.generalError;
    error: any;
    critical?: boolean;
}

export interface IThrottlingError {
    readonly errorType: ErrorType.throttlingError;
    readonly message: string;
    readonly retryAfterSeconds: number;
    critical?: boolean;
}

export interface IBaseConnectionError {
    readonly message: string;
    readonly canRetry?: boolean;
    readonly statusCode?: number;
    readonly online: string;
    critical?: boolean;
}

export interface IGenericNetworkError extends IBaseConnectionError {
    readonly errorType: ErrorType.genericNetworkError;
}

export interface IAccessDeniedError extends IBaseConnectionError {
    readonly errorType: ErrorType.accessDeniedError;
}

export interface IFileNotFoundError extends IBaseConnectionError {
    readonly errorType: ErrorType.fileNotFoundError;
}

export interface IServiceError {
    readonly errorType: ErrorType.serviceError;
    critical?: boolean;
}

export interface ISummarizingError {
    readonly errorType: ErrorType.summarizingError;
    readonly description: string;
    critical?: boolean;
}

export interface IWriteError {
    readonly errorType: ErrorType.writeError;
    readonly critical: boolean;
}

export interface IFatalError {
    readonly errorType: ErrorType.fatalError;
    readonly critical: boolean;
}
