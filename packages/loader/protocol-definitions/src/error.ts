/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable: no-unsafe-any
export enum ErrorOrWarningType {
    generalError,
    connectionError,
    throttling,
    serviceWarning,
    summarizingWarning,
}

export function isWarning(error: IErrorOrWarning) {
    if (error.type === ErrorOrWarningType.serviceWarning ||
        error.type === ErrorOrWarningType.summarizingWarning) {
            return true;
        }
    return false;
}

export type IErrorOrWarning = IGeneralError | IThrottlingError | IConnectionError |
                IServiceWarning | ISummarizingWarning;

export interface IGeneralError {
    readonly type: ErrorOrWarningType.generalError;
    error: any;
}

export interface IThrottlingError {
    readonly type: ErrorOrWarningType.throttling;
    readonly message: string;
    readonly retryAfterSeconds: number;
}

export interface IConnectionError {
    readonly type: ErrorOrWarningType.connectionError;
    readonly message: string;
    readonly canRetry?: boolean;
    readonly statusCode?: number;
    readonly online: string;
}

export interface IServiceWarning {
    readonly type: ErrorOrWarningType.serviceWarning;
}

export interface ISummarizingWarning {
    readonly type: ErrorOrWarningType.summarizingWarning;
}
