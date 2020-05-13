/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable: no-unsafe-any
export enum ErrorType {
    generalError,
    genericNetworkError,
    authorizationError,
    fileNotFoundOrAccessDeniedError,
    outOfStorageError,
    invalidFileNameError,
    throttlingError,
    serviceError,
    summarizingError,
    writeError,
    fatalError,
}

export type IError = IGeneralError | IThrottlingError | IOutOfStorageError | IInvalidFileNameError |
IGenericNetworkError | IAuthorizationError | IFileNotFoundOrAccessDeniedError |
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

export interface IAuthorizationError extends IBaseConnectionError {
    readonly errorType: ErrorType.authorizationError;
}

export interface IFileNotFoundOrAccessDeniedError extends IBaseConnectionError {
    readonly errorType: ErrorType.fileNotFoundOrAccessDeniedError;
}

export interface IOutOfStorageError extends IBaseConnectionError {
    readonly errorType: ErrorType.outOfStorageError;
}

export interface IInvalidFileNameError extends IBaseConnectionError {
    readonly errorType: ErrorType.invalidFileNameError;
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
