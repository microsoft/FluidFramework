/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger, ITelemetryProperties } from "@fluidframework/common-definitions";
import { canRetryOnError, getRetryDelayFromError } from "@fluidframework/driver-utils";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import { fetchHelper, getWithRetryForTokenRefresh } from "./odspUtils";
import {
    IdentityType,
    OdspResourceTokenFetchOptions,
    TokenFetcher,
    tokenFromResponse,
} from "./tokenFetch";

async function getRequestIdsFromResponse(headers: Map<string, string>): Promise<ITelemetryProperties> {
    interface LoggingHeader {
        headerName: string;
        logName: string;
    }
    // We rename headers so that otel doesn't scrub them away. Otel doesn't allow
    // certain characters in headers including '-'
    const headersToLog: LoggingHeader[] = [
        { headerName: "sprequestguid", logName: "spRequestGuid" },
        { headerName: "request-id", logName: "requestId" },
        { headerName: "client-request-id", logName: "clientRequestId" },
        { headerName: "x-msedge-ref", logName: "xMsedgeRef" },
    ];
    const additionalProps: ITelemetryProperties = {};
    if (headers) {
        headersToLog.forEach((header) => {
            const headerValue = headers.get(header.headerName);
            if (headerValue !== undefined) {
                additionalProps[header.logName] = headerValue;
            }
        });
    }
    return additionalProps;
}

/**
 * returns a promise that resolves after timeMs
 */
async function delay(timeMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(() => resolve(), timeMs));
}

// Store cached rsponses for the lifetime of web session as file link remains the same for given file item
const fileLinkCache: { [key: string]: Promise<string | undefined> } = {};

/**
 * Returns file link for a file with given drive and item ids.
 * Scope needed: files.readwrite.all.
 * This function keeps retrying if it gets a retriable error or wait for some delay if it gets a
 * throttling error. In future, we are thinking of app allowing to pass some cancel token, with which
 * we would be able to stop retrying.
 * @param getToken - used to fetch access tokens needed to execute operation
 * @param siteUrl - url of the site that contains the file
 * @param driveId - drive where file is stored
 * @param itemId - file id
 * @param identityType - type of client account
 * @param logger - used to log results of operation, including any error
 * @returns Promise which resolves to file link url when successful; otherwise, undefined.
 */
export async function getFileLink(
    getToken: TokenFetcher<OdspResourceTokenFetchOptions>,
    siteUrl: string,
    driveId: string,
    itemId: string,
    identityType: IdentityType,
    logger: ITelemetryLogger,
): Promise<string | undefined> {
    const cacheKey = `${siteUrl}_${driveId}_${itemId}`;
    const cachedPromise = fileLinkCache[cacheKey];
    if (cachedPromise) {
        return cachedPromise;
    }

    const promise = new Promise<string | undefined>(async (resolve, reject) => {
        let result: string | undefined;
        let success = false;
        let retryAfter = 0;
        do {
            try {
                result = await getFileLinkCore(getToken, siteUrl, driveId, itemId, identityType, logger);
                success = true;
            } catch (err) {
                // If it is not retriable, then just throw the error.
                if (!canRetryOnError(err)) {
                    reject(err);
                } else {
                    // If the error is throttling error, then wait for the specified time before retrying.
                    // If the waitTime is not specified, then we start with retrying immediately to max of 8s.
                    retryAfter = getRetryDelayFromError(err) ?? Math.min(retryAfter * 2, 8000);
                    await delay(retryAfter);
                }
            }
        } while (!success);
        resolve(result);
    });

    fileLinkCache[cacheKey] = promise;

    promise.catch(() => delete fileLinkCache[cacheKey]);

    return promise;
}

async function getFileLinkCore(
    getToken: TokenFetcher<OdspResourceTokenFetchOptions>,
    siteUrl: string,
    driveId: string,
    itemId: string,
    identityType: IdentityType,
    logger: ITelemetryLogger,
): Promise<string | undefined> {
    const fileItem = await getFileItemLite(getToken, siteUrl, driveId, itemId, logger);
    if (!fileItem) {
        return undefined;
    }

    // ODC canonical link does not require any additional processing
    if (identityType === "Consumer") {
        return fileItem.webUrl;
    }

    let tries = 0;
    let additionalProps;
    // ODSP link requires extra call to return link that is resistant to file being renamed or moved to different folder
    return await PerformanceEvent.timedExecAsync(
        logger,
        { eventName: "odspFileLink", requestName: "getSharingInformation" },
        async (event) => {
            const fileLink = await getWithRetryForTokenRefresh(async (options) => {
                tries++;
                const token = await getToken({ ...options, siteUrl });
                const { url, headers } = getUrlAndHeadersWithAuth(
                    `${siteUrl}/_api/web/GetFileByUrl(@a1)/ListItemAllFields/GetSharingInformation?@a1=${
                        encodeURIComponent(`'${fileItem.webDavUrl}'`)
                    }`, tokenFromResponse(token));
                const requestInit = {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json;odata=verbose",
                        "Accept": "application/json;odata=verbose",
                        ...headers,
                    },
                };
                const response = await fetchHelper(url, requestInit);
                additionalProps = await getRequestIdsFromResponse(new Map(response.headers));
                if (response.ok) {
                    const sharingInfo = await response.json();
                    return sharingInfo?.d?.directUrl as string;
                }
                return undefined;
            });
            event.end({ ...additionalProps, tries });
            return fileLink;
        },
    );
}

/**
 * This represents a lite version of file item containing only the webUrl and webDavUrl properties
 */
interface FileItemLite {
    webUrl: string;
    webDavUrl: string;
}

async function getFileItemLite(
    getToken: TokenFetcher<OdspResourceTokenFetchOptions>,
    siteUrl: string,
    driveId: string,
    itemId: string,
    logger: ITelemetryLogger,
): Promise<FileItemLite | undefined> {
    let tries = 0;
    let additionalProps;
    return await PerformanceEvent.timedExecAsync(
        logger,
        { eventName: "odspFileLink", requestName: "getFileItemLite" },
        async (event) => {
            const fileItem = await getWithRetryForTokenRefresh(async (options) => {
                tries++;
                const token = await getToken({ ...options, siteUrl });
                const { url, headers } = getUrlAndHeadersWithAuth(
                    `${siteUrl}/_api/v2.0/drives/${driveId}/items/${itemId}?select=webUrl,webDavUrl`,
                    tokenFromResponse(token),
                );
                const requestInit = { method: "GET", headers };
                const response = await fetchHelper(url, requestInit);
                additionalProps = await getRequestIdsFromResponse(new Map(response.headers));
                if (response.ok) {
                    return await response.json() as FileItemLite;
                }
                return undefined;
            });
            event.end({ ...additionalProps, tries });
            if (fileItem && fileItem.webDavUrl && fileItem.webUrl) {
                return fileItem;
            }
            return undefined;
        },
    );
}
