/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable: no-unsafe-any
export enum ErrorOrWarningType {
    generalError,
    fileioError,
    throttling,
    serviceWarning,
    fileVersionError,
    summarizingWarning,
}

export type IErrorOrWarning = IGeneralError | IThrottlingError | IFileIOError |
                IServiceWarning | IFileVersionError | ISummarizingWarning;

export interface IGeneralError {
    readonly containerErrorOrWarningType: ErrorOrWarningType.generalError;
    error: any;
}

export interface IThrottlingError {
    readonly containerErrorOrWarningType: ErrorOrWarningType.throttling;
    readonly message: string;
    readonly canRetry?: boolean;
    readonly statusCode?: number;
    readonly online: string;
    readonly retryAfterSeconds: number;
}

export interface IFileIOError {
    readonly containerErrorOrWarningType: ErrorOrWarningType.fileioError;
    readonly message: string;
    readonly canRetry?: boolean;
    readonly statusCode?: number;
    readonly online: string;
}

export interface IServiceWarning {
    readonly containerErrorOrWarningType: ErrorOrWarningType.serviceWarning;
}

export interface IFileVersionError {
    readonly containerErrorOrWarningType: ErrorOrWarningType.fileVersionError;
}

export interface ISummarizingWarning {
    readonly containerErrorOrWarningType: ErrorOrWarningType.summarizingWarning;
}
