/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AxiosResponse } from "axios";

export const offlineFetchFailureStatusCode: number = 709;
export const fetchFailureStatusCode: number = 710;
// Status code for invalid file name error in odsp driver.
export const invalidFileNameStatusCode: number = 711;
// no response, or can't parse response
export const fetchIncorrectResponse = 712;

export enum OdspErrorType {
    /**
     * Invalid file name (at creation of the file)
     */
    invalidFileNameError = "invalidFileNameError",
}

/**
 * Base interface for all errors and warnings
 */
export interface IOdspError {
    readonly errorType: OdspErrorType;
    readonly message: string;
    canRetry: boolean;
}

export type OdspError =
    | DriverError
    | IOdspError;

export function createOdspNetworkError(
    errorMessage: string,
    statusCode?: number,
    retryAfterSeconds?: number,
    claims?: string,
): OdspError {
    let error: OdspError;

    switch (statusCode) {
        case 400:
            error = new GenericNetworkError(errorMessage, false, statusCode);
            break;
        case 401:
        case 403:
            error = new AuthorizationError(errorMessage, claims);
            break;
        case 404:
            error = new NetworkErrorBasic(errorMessage, DriverErrorType.fileNotFoundOrAccessDeniedError, false);
            break;
        case 414:
        case invalidFileNameStatusCode:
            error = new NonRetryableError(errorMessage, OdspErrorType.invalidFileNameError);
            break;
        case 500:
            error = new GenericNetworkError(errorMessage, true);
            break;
        case offlineFetchFailureStatusCode:
            error = new NetworkErrorBasic(errorMessage, DriverErrorType.offlineError, true);
            break;
        case fetchFailureStatusCode:
            error = new NetworkErrorBasic(errorMessage, DriverErrorType.fetchFailure, true);
            break;
        case fetchIncorrectResponse:
            error = new NetworkErrorBasic(errorMessage, DriverErrorType.incorrectServerResponse, false);
            break;
        default:
            error = createGenericNetworkError(errorMessage, true, retryAfterSeconds, statusCode);
    }

    return error;
}

/**
 * Driver Error types
 * Lists types that are likely to be used by all drivers
 */
export enum DriverErrorType {
    /**
     * Some error, most likely an exception caught by runtime and propagated to container as critical error
     */
    genericError = "genericError",

    /**
     * Some non-categorized (below) networking error
     * Include errors like  fatal server error (usually 500).
     */
    genericNetworkError = "genericNetworkError",

    /**
     * Access denied - user does not have enough privileges to open a file, or continue to operate on a file
     */
    authorizationError = "authorizationError",

    /**
     * File not found, or file deleted during session
     */
    fileNotFoundOrAccessDeniedError = "fileNotFoundOrAccessDeniedError",

    /**
     * We can not reach server due to computer being offline.
     */
    offlineError = "offlineError",

    /**
     * User does not have write permissions to a file, but is changing content of a file.
     * That might be indication of some data store error - data stores should not generate ops in readonly mode.
     */
    writeError = "writeError",

    /**
     * Generic fetch failure.
     * Most of such failures are due to client being offline, or DNS is not reachable, such errors map to
     * DriverErrorType.offlineError. Anything else that can't be diagnose as likely offline maps to this error.
     * This can also indicate no response from server.
     */
    fetchFailure = "fetchFailure",

    /**
     * Unexpected response from server. Either JSON is malformed, or some required properties are missing
     */
    incorrectServerResponse = "incorrectServerResponse",
}

/**
 * Base interface for all errors and warnings
 */
export interface IDriverErrorBase {
    readonly errorType: DriverErrorType;
    readonly message: string;
    canRetry: boolean;
}

export interface IGenericNetworkError extends IDriverErrorBase {
    readonly errorType: DriverErrorType.genericNetworkError;
    readonly statusCode?: number;
}

export interface IAuthorizationError extends IDriverErrorBase {
    readonly errorType: DriverErrorType.authorizationError;
    readonly claims?: string;
}

/**
 * Having this uber interface without types that have their own interfaces
 * allows compiler to differentiate interfaces based on error type
 */
export interface IDriverBasicError extends IDriverErrorBase {
    readonly errorType:
    DriverErrorType.genericError
    | DriverErrorType.authorizationError
    | DriverErrorType.fileNotFoundOrAccessDeniedError
    | DriverErrorType.offlineError
    | DriverErrorType.writeError
    | DriverErrorType.fetchFailure
    | DriverErrorType.incorrectServerResponse;
    readonly statusCode?: number;
}

export type DriverError =
    | IGenericNetworkError
    | IAuthorizationError
    | IDriverBasicError;

/**
 * Generic network error class.
 */
export class GenericNetworkError  implements IDriverErrorBase {
    readonly errorType = DriverErrorType.genericNetworkError;

    constructor(
        readonly message: string,
        readonly canRetry: boolean,
        readonly statusCode?: number,
    ) {}
}

export class AuthorizationError implements IAuthorizationError {
    readonly errorType = DriverErrorType.authorizationError;
    readonly canRetry = false;

    constructor(
        readonly message: string,
        readonly claims?: string,
    ) {}
}

export class NetworkErrorBasic<T> {
    constructor(
        readonly message: string,
        readonly errorType: T,
        readonly canRetry: boolean,
    ) {}
}

export class NonRetryableError<T> extends NetworkErrorBasic<T> {
    constructor(
        errorMessage: string,
        readonly errorType: T,
    ) {
        super(errorMessage, errorType, false);
    }
}

export const createWriteError = (errorMessage: string) =>
    new NonRetryableError(errorMessage, DriverErrorType.writeError);

export function createGenericNetworkError(
    errorMessage: string,
    canRetry: boolean,
    retryAfterSeconds?: number,
    statusCode?: number) {
    return new GenericNetworkError(errorMessage, canRetry, statusCode);
}

/**
 * Throws network error - an object with a bunch of network related properties
 */
export function throwOdspNetworkError(
    errorMessage: string,
    response: AxiosResponse,
) {
    const networkError = createOdspNetworkError(
        response ? `${errorMessage}, msg = ${response.statusText}, type = ${response.data?.error}` : errorMessage,
        response.data?.error === "invalid_grant" ? 401 : response.status,
        undefined /* retryAfterSeconds */,
        undefined);

    (networkError as any).sprequestguid = response?.headers ? `${response.headers.sprequestguid}` : undefined;

    throw networkError;
}
