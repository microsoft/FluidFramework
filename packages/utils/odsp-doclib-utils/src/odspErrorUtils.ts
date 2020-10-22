/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DriverError, DriverErrorType } from "@fluidframework/driver-definitions";
import {
    AuthorizationError,
    createGenericNetworkError,
    GenericNetworkError,
    isOnline,
    NetworkErrorBasic,
    NonRetryableError,
    OnlineStatus,
} from "@fluidframework/driver-utils";

export const offlineFetchFailureStatusCode: number = 709;
export const fetchFailureStatusCode: number = 710;
// Status code for invalid file name error in odsp driver.
export const invalidFileNameStatusCode: number = 711;
// no response, or can't parse response
export const fetchIncorrectResponse = 712;
// Fetch request took more time then limit.
export const fetchTimeoutStatusCode = 713;

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
     * Maximum time limit to fetch reached. Host application specified limit for fetching of snapshot, when
     * that limit is reached, request fails. Hosting application is expected to have fall-back behavior for
     * such case.
     */
    fetchTimeout = "fetchTimeout",

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
        case 406:
            error = new NetworkErrorBasic(errorMessage, DriverErrorType.unsupportedClientProtocolVersion, false);
            break;
        case 413:
            error = new NonRetryableError(errorMessage, OdspErrorType.snapshotTooBig);
            break;
        case 414:
        case invalidFileNameStatusCode:
            error = new NonRetryableError(errorMessage, OdspErrorType.invalidFileNameError);
            break;
        case 500:
            error = new GenericNetworkError(errorMessage, true);
            break;
        case 501:
            error = new NonRetryableError(errorMessage, OdspErrorType.fluidNotEnabled);
            break;
        case 507:
            error = new NonRetryableError(errorMessage, OdspErrorType.outOfStorageError);
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
        case fetchTimeoutStatusCode:
            error = new NonRetryableError(errorMessage, OdspErrorType.fetchTimeout);
            break;
        default:
            error = createGenericNetworkError(errorMessage, true, retryAfterSeconds, statusCode);
    }

    error.online = OnlineStatus[isOnline()];

    return error;
}

/**
 * Throws network error - an object with a bunch of network related properties
 */
export function throwOdspNetworkError(
    errorMessage: string,
    statusCode: number,
    response?: Response,
) {
    const networkError = createOdspNetworkError(
        response ? `${errorMessage}, msg = ${response.statusText}, type = ${response.type}` : errorMessage,
        statusCode,
        undefined /* retryAfterSeconds */,
        undefined);

    throw networkError;
}
