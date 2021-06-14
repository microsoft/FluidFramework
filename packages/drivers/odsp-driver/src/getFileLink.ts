/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { delay, PromiseCache } from "@fluidframework/common-utils";
import { canRetryOnError, getRetryDelayFromError } from "@fluidframework/driver-utils";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import {
    IOdspUrlParts,
    OdspResourceTokenFetchOptions,
    IdentityType,
    TokenFetcher,
    tokenFromResponse,
} from "@fluidframework/odsp-driver-definitions";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import { fetchHelper, getWithRetryForTokenRefresh } from "./odspUtils";

// Store cached responses for the lifetime of web session as file link remains the same for given file item
const fileLinkCache = new PromiseCache<string, string | undefined>();

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
    odspUrlParts: IOdspUrlParts,
    identityType: IdentityType,
    logger: ITelemetryLogger,
): Promise<string | undefined> {
    const cacheKey = `${odspUrlParts.siteUrl}_${odspUrlParts.driveId}_${odspUrlParts.itemId}`;
    if (fileLinkCache.has(cacheKey)) {
        return fileLinkCache.get(cacheKey);
    }

    const valueGenerator = async function() {
        let result: string | undefined;
        let success = false;
        let retryAfterMs = 1000;
        do {
            try {
                result = await getFileLinkCore(getToken, odspUrlParts, identityType, logger);
                success = true;
            } catch (err) {
                // If it is not retriable, then just return undefined
                if (!canRetryOnError(err)) {
                    fileLinkCache.remove(cacheKey);
                    return undefined;
                }
                // If the error is throttling error, then wait for the specified time before retrying.
                // If the waitTime is not specified, then we start with retrying immediately to max of 8s.
                retryAfterMs = getRetryDelayFromError(err) ?? Math.min(retryAfterMs * 2, 8000);
                await delay(retryAfterMs);
            }
        } while (!success);
        return result;
    };
    fileLinkCache.add(cacheKey, valueGenerator);
    return fileLinkCache.get(cacheKey);
}

async function getFileLinkCore(
    getToken: TokenFetcher<OdspResourceTokenFetchOptions>,
    odspUrlParts: IOdspUrlParts,
    identityType: IdentityType,
    logger: ITelemetryLogger,
): Promise<string | undefined> {
    const fileItem = await getFileItemLite(getToken, odspUrlParts, logger);
    if (!fileItem) {
        return undefined;
    }

    // ODC canonical link does not require any additional processing
    if (identityType === "Consumer") {
        return fileItem.webUrl;
    }

    // ODSP link requires extra call to return link that is resistant to file being renamed or moved to different folder
    return PerformanceEvent.timedExecAsync(
        logger,
        { eventName: "odspFileLink", requestName: "getSharingInformation" },
        async (event) => {
            let attempts = 0;
            let additionalProps;
            const fileLink = await getWithRetryForTokenRefresh(async (options) => {
                attempts++;
                const token = await getToken({ ...options, ... odspUrlParts });
                const { url, headers } = getUrlAndHeadersWithAuth(
                    `${odspUrlParts.siteUrl}/_api/web/GetFileByUrl(@a1)/ListItemAllFields/GetSharingInformation?@a1=${
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
                additionalProps = response.commonSpoHeaders;
                if (response.content.ok) {
                    const sharingInfo = await response.content.json();
                    return sharingInfo?.d?.directUrl as string;
                }
                return undefined;
            });
            event.end({ ...additionalProps, attempts });
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
    odspUrlParts: IOdspUrlParts,
    logger: ITelemetryLogger,
): Promise<FileItemLite | undefined> {
    return PerformanceEvent.timedExecAsync(
        logger,
        { eventName: "odspFileLink", requestName: "getFileItemLite" },
        async (event) => {
            let attempts = 0;
            let additionalProps;
            const fileItem = await getWithRetryForTokenRefresh(async (options) => {
                attempts++;
                const {siteUrl, driveId, itemId} = odspUrlParts;
                const token = await getToken({ ...options, siteUrl, driveId, itemId});
                const { url, headers } = getUrlAndHeadersWithAuth(
                    `${siteUrl}/_api/v2.0/drives/${driveId}/items/${itemId}?select=webUrl,webDavUrl`,
                    tokenFromResponse(token),
                );
                const requestInit = { method: "GET", headers };
                const response = await fetchHelper(url, requestInit);
                additionalProps = response.commonSpoHeaders;
                if (response.content.ok) {
                    return await response.content.json() as FileItemLite;
                }
                return undefined;
            });
            event.end({ ...additionalProps, attempts });
            if (fileItem && fileItem.webDavUrl && fileItem.webUrl) {
                return fileItem;
            }
            return undefined;
        },
    );
}
