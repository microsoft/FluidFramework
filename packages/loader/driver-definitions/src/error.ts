/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable: no-unsafe-any
export enum ErrorType {
    generalError,
    connectionError,
    throttlingError,
    serviceError,
    summarizingError,
    writeError,
    fatalError,
}

export enum ConnectionErrorType {
    accessDenied,
    notFound,
}

export type IError = IGeneralError | IThrottlingError | IConnectionError |
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

export interface IConnectionError {
    readonly errorType: ErrorType.connectionError;
    readonly connectionError?: ConnectionErrorType
    readonly message: string;
    readonly canRetry?: boolean;
    readonly statusCode?: number;
    readonly online: string;
    critical?: boolean;
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
