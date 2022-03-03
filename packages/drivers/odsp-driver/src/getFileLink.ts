/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, delay } from "@fluidframework/common-utils";
import { canRetryOnError, getRetryDelayFromError, NonRetryableError } from "@fluidframework/driver-utils";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import {
    IOdspUrlParts,
    OdspResourceTokenFetchOptions,
    IdentityType,
    TokenFetcher,
    tokenFromResponse,
} from "@fluidframework/odsp-driver-definitions";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import { fetchHelper, getWithRetryForTokenRefresh } from "./odspUtils";
import { pkgVersion as driverVersion } from "./packageVersion";

// Store cached responses for the lifetime of web session as file link remains the same for given file item
const fileLinkCache = new Map<string, Promise<string>>();

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
): Promise<string> {
    const cacheKey = `${odspUrlParts.siteUrl}_${odspUrlParts.driveId}_${odspUrlParts.itemId}`;
    const maybeFileLinkCacheEntry = fileLinkCache.get(cacheKey);
    if (maybeFileLinkCacheEntry !== undefined) {
        return maybeFileLinkCacheEntry;
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
                // If it is not retriable, then just throw
                if (!canRetryOnError(err)) {
                    // Delete from the cache to permit retrying later.
                    fileLinkCache.delete(cacheKey);
                    throw err;
                }
                // If the error is throttling error, then wait for the specified time before retrying.
                // If the waitTime is not specified, then we start with retrying immediately to max of 8s.
                retryAfterMs = getRetryDelayFromError(err) ?? Math.min(retryAfterMs * 2, 8000);
                await delay(retryAfterMs);
            }
        } while (!success);

        // We are guaranteed to run the getFileLinkCore at least once with successful result (which must be a string)
        assert(result !== undefined, 0x292 /* "Unexpected undefined result from getFileLinkCore" */);
        return result;
    };
    const fileLink = valueGenerator();
    fileLinkCache.set(cacheKey, fileLink);
    return fileLink;
}

async function getFileLinkCore(
    getToken: TokenFetcher<OdspResourceTokenFetchOptions>,
    odspUrlParts: IOdspUrlParts,
    identityType: IdentityType,
    logger: ITelemetryLogger,
): Promise<string> {
    const fileItem = await getFileItemLite(getToken, odspUrlParts, logger, identityType === "Consumer");

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
                    }`,
                    tokenFromResponse(token),
                    false,
                );
                const requestInit = {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json;odata=verbose",
                        "Accept": "application/json;odata=verbose",
                        ...headers,
                    },
                };
                const response = await fetchHelper(url, requestInit);
                additionalProps = response.propsToLog;

                const sharingInfo = await response.content.json();
                const directUrl = sharingInfo?.d?.directUrl;
                if (typeof directUrl !== "string") {
                    // This will retry once in getWithRetryForTokenRefresh
                    throw new NonRetryableError(
                        "Malformed GetSharingInformation response",
                        DriverErrorType.incorrectServerResponse,
                        { driverVersion });
                }
                return directUrl;
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

const isFileItemLite = (maybeFileItemLite: any): maybeFileItemLite is FileItemLite => {
    if (typeof maybeFileItemLite.webUrl !== "string" || typeof maybeFileItemLite.webDavUrl !== "string") {
        return false;
    }
    return true;
};

async function getFileItemLite(
    getToken: TokenFetcher<OdspResourceTokenFetchOptions>,
    odspUrlParts: IOdspUrlParts,
    logger: ITelemetryLogger,
    forceAccessTokenViaAuthorizationHeader: boolean,
): Promise<FileItemLite> {
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
                    forceAccessTokenViaAuthorizationHeader,
                );
                const requestInit = { method: "GET", headers };
                const response = await fetchHelper(url, requestInit);
                additionalProps = response.propsToLog;

                const responseJson = await response.content.json();
                if (!isFileItemLite(responseJson)) {
                    // This will retry once in getWithRetryForTokenRefresh
                    throw new NonRetryableError(
                        "Malformed getFileItemLite response",
                        DriverErrorType.incorrectServerResponse,
                        { driverVersion });
                }
                return responseJson;
            });
            event.end({ ...additionalProps, attempts });
            return fileItem;
        },
    );
}
