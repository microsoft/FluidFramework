/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResolvedUrl } from "./urlResolver";

/**
 * Driver Error types
 * Lists types that are likely to be used by all drivers
 */
export enum DriverErrorType {
    /**
     * A fatal error with no specific interpretation covered by other DriverErrorType values
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
     * A generic fetch failure that indicates we were not able to get a response from the server.
     * This may be due to the client being offline (though, if we are able to detect offline state it will be
     * logged as an offlineError instead).  Other possibilities could be DNS errors, malformed fetch request,
     * CSP violation, etc.
     */
    fetchFailure = "fetchFailure",

    /**
     * Unexpected response from server. Either JSON is malformed, or some required properties are missing
     */
    incorrectServerResponse = "incorrectServerResponse",

    /**
     * This error occurs when the file is modified externally (not through Fluid protocol) in storage.
     * It will occur in cases where client has some state or cache that is based on old content (identity) of a file,
     * and storage / driver / loader detects such mismatch.
     * When it's hit, client needs to forget all the knowlege about this file and start over.
     */
    fileOverwrittenInStorage = "fileOverwrittenInStorage",

    /**
     * The document is read-only and delta stream connection is forbidden.
     */
    deltaStreamConnectionForbidden = "deltaStreamConnectionForbidden",

    /**
     * The location of file/container can change on server. So if the file location moves and we try to access the old
     * location, then this error is thrown to let the client know about the new location info.
     */
    locationRedirection = "locationRedirection",

    /**
     * When a file is not a Fluid file, but has Fluid extension such as ".note",
     * server won't be able to open it and will return this error. The innerMostErrorCode will be
     * "fluidInvalidSchema"
     */
    fluidInvalidSchema = "fluidInvalidSchema",
    /**
     * Error indicating an API is being used improperly resulting in an invalid operation.
     * ! Should match the value of ContainerErrorType.usageError
    */
    usageError = "usageError",
}

/**
 * Interface describing errors and warnings raised by any driver code.
 * Not expected to be implemented by a class or an object literal, but rather used in place of
 * any or unknown in various function signatures that pass errors around.
 *
 * "Any" in the interface name is a nod to the fact that errorType has lost its type constraint.
 * It will be either DriverErrorType or the specific driver's specialized error type enum,
 * but we can't reference a specific driver's error type enum in this code.
 */
export interface IAnyDriverError extends Omit<IDriverErrorBase, "errorType"> {
    readonly errorType: string;
}

/**
 * Base interface for all errors and warnings
 */
export interface IDriverErrorBase {
    /** Classification of what type of error this is, used programmatically by consumers to interpret the error */
    readonly errorType: DriverErrorType;
    /** Free-form error message */
    readonly message: string;
    /** True indicates the caller may retry the failed action. False indicates it's a fatal error */
    canRetry: boolean;
    /**
     * Best guess as to network conditions (online/offline) when the error arose.
     * See OnlineStatus enum in driver-utils package for expected values.
     */
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

export interface ILocationRedirectionError extends IDriverErrorBase {
    readonly errorType: DriverErrorType.locationRedirection;
    readonly redirectUrl: IResolvedUrl;
}

/**
 * Having this uber interface without types that have their own interfaces
 * allows compiler to differentiate interfaces based on error type
 */
export interface IDriverBasicError extends IDriverErrorBase {
    readonly errorType:
    DriverErrorType.genericError
    | DriverErrorType.fileNotFoundOrAccessDeniedError
    | DriverErrorType.offlineError
    | DriverErrorType.unsupportedClientProtocolVersion
    | DriverErrorType.writeError
    | DriverErrorType.fetchFailure
    | DriverErrorType.incorrectServerResponse
    | DriverErrorType.fileOverwrittenInStorage
    | DriverErrorType.fluidInvalidSchema
    | DriverErrorType.usageError;
    readonly statusCode?: number;
}

export type DriverError =
    | IThrottlingWarning
    | IGenericNetworkError
    | IAuthorizationError
    | ILocationRedirectionError
    | IDriverBasicError;
