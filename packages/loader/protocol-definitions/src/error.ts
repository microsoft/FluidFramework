/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable: no-unsafe-any
export enum ErrorType {
    GENERAL_ERROR,
    FILEIO_ERROR,
    THROTTLING_ERROR,
    SERVICE_ERROR,
    VERSION_ERROR,
    SUMMARIZING_ERROR,
}

export interface IError {
    containerErrorType: ErrorType;
}

export interface IGeneralError {
    readonly containerErrorType: ErrorType.GENERAL_ERROR;
}

export interface IThrottlingError {
    readonly containerErrorType: ErrorType.THROTTLING_ERROR;
}

export interface IFileIOError {
    readonly containerErrorType: ErrorType.FILEIO_ERROR;
}

export function convertErrorToSpecificError(error) {
    let specificError;
    if (typeof error === "string") {
        specificError = {
            containerErrorType: ErrorType.GENERAL_ERROR,
            message: error,
        };
        return specificError as IGeneralError;
    } else if (error !== null && typeof error === "object") {
        if (error.retryAfter >= 0) {
            specificError = {
                containerErrorType: ErrorType.THROTTLING_ERROR,
                ...error,
            };
            return specificError as IThrottlingError;
        } else if (error.statusCode) {
            specificError = {
                containerErrorType: ErrorType.FILEIO_ERROR,
                ...error,
            };
            return specificError as IFileIOError;
        } else {
            specificError = {
                containerErrorType: ErrorType.GENERAL_ERROR,
                ...error,
            };
            return specificError as IGeneralError;
        }
    }
    return error;
}
