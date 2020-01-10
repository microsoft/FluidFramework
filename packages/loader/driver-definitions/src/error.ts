/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable: no-unsafe-any
export enum ErrorType {
    generalError,
    connectionError,
    throttling,
    serviceError,
    summarizingError,
}

export type IError = IGeneralError | IThrottlingError | IConnectionError |
IServiceError | ISummarizingError;

export interface IGeneralError {
    readonly type: ErrorType.generalError;
    error: any;
}

export interface IThrottlingError {
    readonly type: ErrorType.throttling;
    readonly message: string;
    readonly retryAfterSeconds: number;
}

export interface IConnectionError {
    readonly type: ErrorType.connectionError;
    readonly message: string;
    readonly canRetry?: boolean;
    readonly statusCode?: number;
    readonly online: string;
}

export interface IServiceError {
    readonly type: ErrorType.serviceError;
}

export interface ISummarizingError {
    readonly type: ErrorType.summarizingError;
}
