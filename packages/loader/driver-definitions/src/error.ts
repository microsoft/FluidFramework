/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable: no-unsafe-any
export enum ErrorType {
    generalError,
    generalConnectionError,
    accessDeniedError,
    fileNotFoundError,
    throttlingError,
    serviceError,
    summarizingError,
    writeError,
    fatalError,
}

export type IError = IGeneralError | IThrottlingError |
IGeneralConnectionError | IAccessDeniedError | IFileNotFoundError |
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

interface IBaseConnectionError {
    readonly message: string;
    readonly canRetry?: boolean;
    readonly statusCode?: number;
    readonly online: string;
    critical?: boolean;
}

export interface IGeneralConnectionError extends IBaseConnectionError {
    readonly errorType: ErrorType.generalConnectionError;
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
