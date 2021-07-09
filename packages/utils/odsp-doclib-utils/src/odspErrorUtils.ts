/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryProperties } from "@fluidframework/common-definitions";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import { LoggingError, TelemetryLogger } from "@fluidframework/telemetry-utils";
import {
    AuthorizationError,
    createGenericNetworkError,
    GenericNetworkError,
    isOnline,
    RetryableError,
    NonRetryableError,
    OnlineStatus,
} from "@fluidframework/driver-utils";
import { OdspErrorType, OdspError } from "@fluidframework/odsp-driver-definitions";
import { parseAuthErrorClaims } from "./parseAuthErrorClaims";
import { parseAuthErrorTenant } from "./parseAuthErrorTenant";

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

export function getSPOAndGraphRequestIdsFromResponse(headers: { get: (id: string) => string | undefined | null}) {
    interface LoggingHeader {
        headerName: string;
        logName: string;
    }
    // We rename headers so that otel doesn't scrub them away. Otel doesn't allow
    // certain characters in headers including '-'
    const headersToLog: LoggingHeader[] = [
        { headerName: "sprequestguid", logName: "sprequestguid" },
        { headerName: "request-id", logName: "requestId" },
        { headerName: "client-request-id", logName: "clientRequestId" },
        { headerName: "x-msedge-ref", logName: "xMsedgeRef" },
        { headerName: "X-Fluid-Retries", logName: "serverRetries" },
    ];
    const additionalProps: ITelemetryProperties = {
        sprequestduration: TelemetryLogger.numberFromString(headers.get("sprequestduration")),
        contentsize: TelemetryLogger.numberFromString(headers.get("content-length")),
    };
    headersToLog.forEach((header) => {
        const headerValue = headers.get(header.headerName);
        // eslint-disable-next-line no-null/no-null
        if (headerValue !== undefined && headerValue !== null) {
            additionalProps[header.logName] = headerValue;
        }
    });
    return additionalProps;
}

export interface IFacetCodes {
    facetCodes?: string[];
 }

export function parseFacetCodes(response: string): string[] {
    const stack: string[] = [];
    let error;
    try {
        error = JSON.parse(response).error;
    }
    catch(e) {
        return stack;
    }

    // eslint-disable-next-line no-null/no-null
    while (typeof error === "object" && error !== null) {
        if (error.code !== undefined) {
            stack.unshift(error.code);
        }
        error = error.innerError;
    }
    return stack;
}

export function createOdspNetworkError(
    errorMessage: string,
    statusCode: number,
    retryAfterSeconds?: number,
    response?: Response,
    responseText?: string,
    props: ITelemetryProperties = {},
): OdspError & LoggingError & IFacetCodes {
    let error: OdspError & LoggingError & IFacetCodes;
    switch (statusCode) {
        case 400:
            error = new GenericNetworkError(errorMessage, false, { statusCode });
            break;
        case 401:
        case 403:
            const claims = response?.headers ? parseAuthErrorClaims(response.headers) : undefined;
            const tenantId = response?.headers ? parseAuthErrorTenant(response.headers) : undefined;
            error = new AuthorizationError(errorMessage, claims, tenantId, { statusCode });
            break;
        case 404:
            error = new NonRetryableError(
                errorMessage, DriverErrorType.fileNotFoundOrAccessDeniedError, { statusCode });
            break;
        case 406:
            error = new NonRetryableError(
                errorMessage, DriverErrorType.unsupportedClientProtocolVersion, { statusCode });
            break;
        case 410:
            error = new NonRetryableError(errorMessage, OdspErrorType.cannotCatchUp, { statusCode });
            break;
        case fluidEpochMismatchError:
            error = new NonRetryableError(errorMessage, DriverErrorType.fileOverwrittenInStorage, { statusCode });
            break;
        case 413:
            error = new NonRetryableError(errorMessage, OdspErrorType.snapshotTooBig, { statusCode });
            break;
        case 414:
        case invalidFileNameStatusCode:
            error = new NonRetryableError(errorMessage, OdspErrorType.invalidFileNameError, { statusCode });
            break;
        case 500:
            error = new GenericNetworkError(errorMessage, true, { statusCode });
            break;
        case 501:
            error = new NonRetryableError(errorMessage, OdspErrorType.fluidNotEnabled, { statusCode });
            break;
        case 507:
            error = new NonRetryableError(errorMessage, OdspErrorType.outOfStorageError, { statusCode });
            break;
        case offlineFetchFailureStatusCode:
            error = new RetryableError(errorMessage, DriverErrorType.offlineError, { statusCode });
            break;
        case fetchFailureStatusCode:
            error = new RetryableError(errorMessage, DriverErrorType.fetchFailure, { statusCode });
            break;
        case fetchIncorrectResponse:
            // Note that getWithRetryForTokenRefresh will retry it once, then it becomes non-retryable error
            error = new RetryableError(errorMessage, DriverErrorType.incorrectServerResponse, { statusCode });
            break;
        case fetchTimeoutStatusCode:
            error = new NonRetryableError(errorMessage, OdspErrorType.fetchTimeout, { statusCode });
            break;
        case fetchTokenErrorCode:
            error = new NonRetryableError(errorMessage, OdspErrorType.fetchTokenError, { statusCode });
            break;
        default:
            const retryAfterMs = retryAfterSeconds !== undefined ? retryAfterSeconds * 1000 : undefined;
            error = createGenericNetworkError(errorMessage, true, retryAfterMs, { statusCode });
    }

    error.online = OnlineStatus[isOnline()];

    const facetCodes = responseText !== undefined ? parseFacetCodes(responseText) : undefined;
    error.facetCodes = facetCodes;
    (error as any).response = responseText; // Issue #6139: This shouldn't be logged - will be fixed with #6485

    props.innerMostErrorCode = facetCodes !== undefined ? facetCodes[0] : undefined;
    if (response) {
        props.responseType = response.type;
        if (response.headers) {
            const headers = getSPOAndGraphRequestIdsFromResponse(response.headers);
            for (const key of Object.keys(headers))  {
                props[key] = headers[key];
            }
            props.serverEpoch = response.headers.get("x-fluid-epoch") ?? undefined;
        }
    }
    error.addTelemetryProperties(props);
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
