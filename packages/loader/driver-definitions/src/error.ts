/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable: no-unsafe-any
export enum ErrorType {
    generalError,
    genericNetworkError,
    accessDeniedError,
    fileNotFoundError,
    throttlingError,
    serviceError,
    summarizingError,
    writeError,
    fatalError,
}

export type IError = IGeneralError | IThrottlingError |
IGenericNetworkError | IAccessDeniedError | IFileNotFoundError |
IServiceError | ISummarizingError | IWriteError | IFatalError;

export interface IErrorBase {
    readonly errorType: ErrorType;
    readonly message: string;
    readonly canRetry?: boolean; // to be replaced with 'critical'
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

export interface IAccessDeniedError extends IErrorBase {
    readonly errorType: ErrorType.accessDeniedError;
}

export interface IFileNotFoundError extends IErrorBase {
    readonly errorType: ErrorType.fileNotFoundError;
}

export interface IServiceError extends IErrorBase {
    readonly errorType: ErrorType.serviceError;
}

export interface ISummarizingError extends IErrorBase {
    readonly errorType: ErrorType.summarizingError;
}

export interface IWriteError extends IErrorBase {
    readonly errorType: ErrorType.writeError;
}

export interface IFatalError extends IErrorBase {
    readonly errorType: ErrorType.fatalError;
}
