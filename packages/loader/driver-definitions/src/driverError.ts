/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

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
     * Throttling error from server. Server is busy and is asking not to reconnect for some time
     */
    throttlingError = "throttlingError",

    /**
     * We can not reach server due to computer being offline.
     */
    offlineError = "offlineError",

    /*
     * Unsupported client protocol
     */
    unsupportedClientProtocolVersion = "unsupportedClientProtocolVersion",

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
    online?: string;
}

export interface IThrottlingWarning extends IDriverErrorBase {
    readonly errorType: DriverErrorType.throttlingError;
    readonly retryAfterSeconds: number;
}

export interface IGenericNetworkError extends IDriverErrorBase {
    readonly errorType: DriverErrorType.genericNetworkError;
    readonly statusCode?: number;
}

export interface IAuthorizationError extends IDriverErrorBase {
    readonly errorType: DriverErrorType.authorizationError;
    readonly claims?: string;
    readonly tenantId?: string;
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
    | DriverErrorType.unsupportedClientProtocolVersion
    | DriverErrorType.writeError
    | DriverErrorType.fetchFailure
    | DriverErrorType.incorrectServerResponse;
    readonly statusCode?: number;
}

export type DriverError =
    | IThrottlingWarning
    | IGenericNetworkError
    | IAuthorizationError
    | IDriverBasicError;
