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
import { OdspErrorType, OdspError, IOdspError } from "@fluidframework/odsp-driver-definitions";
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
// Error code for when the server state is read only and client tries to write. This code is set by the server
// and is not likely to change.
export const OdspServiceReadOnlyErrorCode = "serviceReadOnly";

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

/** Empirically-based model of error response inner error from ODSP */
export interface OdspErrorResponseInnerError {
    code?: string;
    innerError?: OdspErrorResponseInnerError
}

/** Empirically-based model of error responses from ODSP */
export interface OdspErrorResponse {
    error: OdspErrorResponseInnerError & {
        message: string;
    }
}

/** Empirically-based type guard for error responses from ODSP */
function isOdspErrorResponse(x: any): x is OdspErrorResponse {
    const error = x?.error;
    return typeof(error?.message) === "string" &&
        (error?.code === undefined || typeof(error?.code) === "string");
}

export function tryParseErrorResponse(
    response: string | undefined,
): { success: true, errorResponse: OdspErrorResponse } | { success: false } {
    try {
        if (response !== undefined) {
            const parsed = JSON.parse(response);
            if (isOdspErrorResponse(parsed)) {
                return { success: true, errorResponse: parsed };
            }
        }
    }
    catch(e) {}
    return { success: false };
}

export function parseFacetCodes(errorResponse: OdspErrorResponse): string[] {
    const stack: string[] = [];
    let error: OdspErrorResponseInnerError | undefined = errorResponse.error;
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
    fluidErrorCode: string,
    errorMessage: string,
    statusCode: number,
    retryAfterSeconds?: number,
    response?: Response,
    responseText?: string,
    props: ITelemetryProperties = {},
): LoggingError & OdspError & IFacetCodes {
    let error: LoggingError & OdspError & IFacetCodes;
    const parseResult = tryParseErrorResponse(responseText);
    let facetCodes: string[] | undefined;
    let innerMostErrorCode: string | undefined;
    if (parseResult.success) {
        // Log the whole response if it looks like the error format we expect
        props.response = responseText;
        const errorResponse = parseResult.errorResponse;
        facetCodes = parseFacetCodes(errorResponse);
        if (facetCodes !== undefined) {
            innerMostErrorCode = facetCodes[0];
            props.innerMostErrorCode = innerMostErrorCode;
        }
    }
    switch (statusCode) {
        case 400:
            error = new GenericNetworkError(fluidErrorCode, errorMessage, false, { statusCode });
            break;
        case 401:
        case 403:
            // The server throws 403 status code with innerMostError code as "serviceReadOnly" for cases where the
            // database on server becomes readonly. The driver retries for such cases with exponential backup logic.
            if (innerMostErrorCode === OdspServiceReadOnlyErrorCode) {
                error = new RetryableError(
                    fluidErrorCode,
                    errorMessage,
                    OdspErrorType.serviceReadOnly,
                );
            } else {
                const claims = response?.headers ? parseAuthErrorClaims(response.headers) : undefined;
                const tenantId = response?.headers ? parseAuthErrorTenant(response.headers) : undefined;
                error = new AuthorizationError(fluidErrorCode, errorMessage, claims, tenantId, { statusCode });
            }
            break;
        case 404:
            error = new NonRetryableError(
                fluidErrorCode, errorMessage, DriverErrorType.fileNotFoundOrAccessDeniedError, { statusCode });
            break;
        case 406:
            error = new NonRetryableError(
                fluidErrorCode, errorMessage, DriverErrorType.unsupportedClientProtocolVersion, { statusCode });
            break;
        case 410:
            error = new NonRetryableError(fluidErrorCode, errorMessage, OdspErrorType.cannotCatchUp, { statusCode });
            break;
        case fluidEpochMismatchError:
            error = new NonRetryableError(
                fluidErrorCode, errorMessage, DriverErrorType.fileOverwrittenInStorage, { statusCode });
            break;
        case 412:
            // "Precondition Failed" error - happens when uploadSummaryWithContext uses wrong parent.
            // Resubmitting same payload is not going to help, so this is non-recoverable failure!
            error = new NonRetryableError(
                fluidErrorCode, errorMessage, DriverErrorType.genericNetworkError, { statusCode });
            break;
        case 413:
            error = new NonRetryableError(fluidErrorCode, errorMessage, OdspErrorType.snapshotTooBig, { statusCode });
            break;
        case 414:
        case invalidFileNameStatusCode:
            error = new NonRetryableError(
                fluidErrorCode, errorMessage, OdspErrorType.invalidFileNameError, { statusCode });
            break;
        case 500:
            error = new GenericNetworkError(fluidErrorCode, errorMessage, true, { statusCode });
            break;
        case 501:
            error = new NonRetryableError(fluidErrorCode, errorMessage, OdspErrorType.fluidNotEnabled, { statusCode });
            break;
        case 507:
            error = new NonRetryableError(
                fluidErrorCode, errorMessage, OdspErrorType.outOfStorageError, { statusCode });
            break;
        case offlineFetchFailureStatusCode:
            error = new RetryableError(fluidErrorCode, errorMessage, DriverErrorType.offlineError, { statusCode });
            break;
        case fetchFailureStatusCode:
            error = new RetryableError(fluidErrorCode, errorMessage, DriverErrorType.fetchFailure, { statusCode });
            break;
        case fetchIncorrectResponse:
            // Note that getWithRetryForTokenRefresh will retry it once, then it becomes non-retryable error
            error = new RetryableError(
                fluidErrorCode, errorMessage, DriverErrorType.incorrectServerResponse, { statusCode });
            break;
        case fetchTimeoutStatusCode:
            error = new RetryableError(fluidErrorCode, errorMessage, OdspErrorType.fetchTimeout, { statusCode });
            break;
        case fetchTokenErrorCode:
            error = new NonRetryableError(fluidErrorCode, errorMessage, OdspErrorType.fetchTokenError, { statusCode });
            break;
        default:
            const retryAfterMs = retryAfterSeconds !== undefined ? retryAfterSeconds * 1000 : undefined;
            error = createGenericNetworkError(fluidErrorCode, errorMessage, true, retryAfterMs, { statusCode });
            break;
    }
    enrichOdspError(error, response, facetCodes, props);
    return error;
}

export function enrichOdspError(
    error: LoggingError & OdspError & IFacetCodes,
    response?: Response,
    facetCodes?: string[],
    props: ITelemetryProperties = {},
) {
    error.online = OnlineStatus[isOnline()];
    if (facetCodes !== undefined) {
        error.facetCodes = facetCodes;
    }

    if (response) {
        props.responseType = response.type;
        if (response.headers) {
            const headers = getSPOAndGraphRequestIdsFromResponse(response.headers);
            for (const key of Object.keys(headers))  {
                props[key] = headers[key];
            }
            (error as IOdspError).serverEpoch = response.headers.get("x-fluid-epoch") ?? undefined;
        }
    }
    error.addTelemetryProperties(props);
    return error;
}

/**
 * Throws network error - an object with a bunch of network related properties
 */
export function throwOdspNetworkError(
    fluidErrorCode: string,
    statusCode: number,
    response?: Response,
    responseText?: string,
    props?: ITelemetryProperties,
): never {
    const networkError = createOdspNetworkError(
        fluidErrorCode,
        response && response.statusText !== "" ? `${fluidErrorCode} (${response.statusText})` : fluidErrorCode,
        statusCode,
        response ? numberFromHeader(response.headers.get("retry-after")) : undefined, /* retryAfterSeconds */
        response,
        responseText,
        props);

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
