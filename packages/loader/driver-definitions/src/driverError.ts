/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
    genericNetworkError  = "genericNetworkError",

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
     * That might be indication of some component error - components should not generate ops in readonly mode.
     */
    writeError = "writeError",
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

export interface IDriverAllOthers extends IDriverErrorBase {
    readonly errorType:
        DriverErrorType.genericError
        | DriverErrorType.authorizationError
        | DriverErrorType.fileNotFoundOrAccessDeniedError
        | DriverErrorType.offlineError
        | DriverErrorType.unsupportedClientProtocolVersion
        | DriverErrorType.writeError;
    readonly statusCode?: number;
}

export type DriverError =
    | IThrottlingWarning
    | IGenericNetworkError
    | IDriverAllOthers;

export enum OdspErrorType {
    /**
     * Storage is out of space
     */
    outOfStorageError = "outOfStorageError",

    /**
     * Invalid file name (at creation of the file)
     */
    invalidFileNameError = "invalidFileNameError",

    /**
     * Snapshot is too big. Host application specified limit for snapshot size, and snapshot was bigger
     * that that limit, thus request failed. Hosting application is expected to have fall-back behavior for
     * such case.
     */
    snapshotTooBig = "snapshotTooBig",

    /*
        * SPO admin toggle: fluid service is not enabled.
        */
    fluidNotEnabled = "fluidNotEnabled",
}

/**
 * Base interface for all errors and warnings
 */
export interface IOdspError {
    readonly errorType: OdspErrorType;
    readonly message: string;
    canRetry: boolean;
    online?: string;
}

export type OdspError =
    | DriverError
    | IOdspError;
