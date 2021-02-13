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
import { parseAuthErrorClaims } from "./parseAuthErrorClaims";
import { parseAuthErrorTenant } from "./parseAuthErrorTenant";

// eslint-disable-next-line no-null/no-null
const nullToUndefined = (a: string | null) => a === null ? undefined : a;

export const offlineFetchFailureStatusCode: number = 709;
export const fetchFailureStatusCode: number = 710;
// Status code for invalid file name error in odsp driver.
export const invalidFileNameStatusCode: number = 711;
// no response, or can't parse response
export const fetchIncorrectResponse = 712;
// Fetch request took more time then limit.
export const fetchTimeoutStatusCode = 713;
// This status code is sent by the server when the client and server epoch mismatches.
// The client sets its epoch version in the calls it makes to the server and if that mismatches
// with the server epoch version, the server throws this error code.
// This indicates that the file/container has been modified externally.
export const fluidEpochMismatchError = 409;
// Error code for when the fetched token is null.
export const fetchTokenErrorCode = 724;

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

    /**
     * Epoch version mismatch failures.
     * This occurs when the file is modified externally. So the version at the client receiving this error
     * does not match the one at the server.
     */
    epochVersionMismatch = "epochVersionMismatch",

    fetchTokenError = "fetchTokenError",
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
    statusCode: number,
    retryAfterSeconds?: number,
    response?: Response,
    responseText?: string,
): OdspError {
    let error: OdspError;
    switch (statusCode) {
        case 400:
            error = new GenericNetworkError(errorMessage, false, statusCode);
            break;
        case 401:
        case 403:
            const claims = response?.headers ? parseAuthErrorClaims(response.headers) : undefined;
            const tenantId = response?.headers ? parseAuthErrorTenant(response.headers) : undefined;
            error = new AuthorizationError(errorMessage, claims, tenantId, statusCode);
            break;
        case 404:
            error = new NetworkErrorBasic(
                errorMessage, DriverErrorType.fileNotFoundOrAccessDeniedError, false, statusCode);
            break;
        case 406:
            error = new NetworkErrorBasic(
                errorMessage, DriverErrorType.unsupportedClientProtocolVersion, false, statusCode);
            break;
        case fluidEpochMismatchError:
            error = new NonRetryableError(errorMessage, OdspErrorType.epochVersionMismatch, statusCode);
            break;
        case 413:
            error = new NonRetryableError(errorMessage, OdspErrorType.snapshotTooBig, statusCode);
            break;
        case 414:
        case invalidFileNameStatusCode:
            error = new NonRetryableError(errorMessage, OdspErrorType.invalidFileNameError, statusCode);
            break;
        case 500:
            error = new GenericNetworkError(errorMessage, true, statusCode);
            break;
        case 501:
            error = new NonRetryableError(errorMessage, OdspErrorType.fluidNotEnabled, statusCode);
            break;
        case 507:
            error = new NonRetryableError(errorMessage, OdspErrorType.outOfStorageError, statusCode);
            break;
        case offlineFetchFailureStatusCode:
            error = new NetworkErrorBasic(errorMessage, DriverErrorType.offlineError, true, statusCode);
            break;
        case fetchFailureStatusCode:
            error = new NetworkErrorBasic(errorMessage, DriverErrorType.fetchFailure, true, statusCode);
            break;
        case fetchIncorrectResponse:
            error = new NetworkErrorBasic(errorMessage, DriverErrorType.incorrectServerResponse, false, statusCode);
            break;
        case fetchTimeoutStatusCode:
            error = new NonRetryableError(errorMessage, OdspErrorType.fetchTimeout, statusCode);
            break;
        case fetchTokenErrorCode:
            error = new NonRetryableError(errorMessage, OdspErrorType.fetchTokenError, statusCode);
            break;
        default:
            error = createGenericNetworkError(errorMessage, true, retryAfterSeconds, statusCode);
    }

    error.online = OnlineStatus[isOnline()];

    const errorAsAny = error as any;

    errorAsAny.response = responseText;
    if (response) {
        errorAsAny.responseType = response.type;
        if (response.headers) {
            errorAsAny.sprequestguid = nullToUndefined(response.headers.get("sprequestguid"));
            errorAsAny.serverEpoch = nullToUndefined(response.headers.get("x-fluid-epoch"));
        }
    }
    return error;
}

/**
 * Throws network error - an object with a bunch of network related properties
 */
export function throwOdspNetworkError(
    errorMessage: string,
    statusCode: number,
    response?: Response,
    responseText?: string,
): never {
    const networkError = createOdspNetworkError(
        response && response.statusText !== "" ? `${errorMessage} (${response.statusText})` : errorMessage,
        statusCode,
        response ? numberFromHeader(response.headers.get("retry-after")) : undefined, /* retryAfterSeconds */
        response,
        responseText);

    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw networkError;
}

function numberFromHeader(header: string | null): number | undefined {
    // eslint-disable-next-line no-null/no-null
    if (header === null) {
        return undefined;
    }
    const n = Number(header);
    if (Number.isNaN(n)) {
        return undefined;
    }
    return n;
}
