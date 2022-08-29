/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { canRetryOnError, NonRetryableError } from "@fluidframework/driver-utils";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import { IOdspUrlParts, OdspResourceTokenFetchOptions, TokenFetcher } from "@fluidframework/odsp-driver-definitions";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import { fetchHelper, getWithRetryForTokenRefresh, toInstrumentedOdspTokenFetcher } from "./odspUtils";
import { pkgVersion as driverVersion } from "./packageVersion";
import { runWithRetry } from "./retryUtils";

// Store cached responses for the lifetime of web session as file link remains the same for given file item
const fileLinkCache = new Map<string, Promise<string>>();

/**
 * Returns file link for a file with given drive and item ids.
 * Scope needed: files.readwrite.all.
 * This function keeps retrying if it gets a retriable error or wait for some delay if it gets a
 * throttling error. In future, we are thinking of app allowing to pass some cancel token, with which
 * we would be able to stop retrying.
 * @param getToken - used to fetch access tokens needed to execute operation
 * @param odspUrlParts - object describing file storage identity
 * @param logger - used to log results of operation, including any error
 * @returns Promise which resolves to file link url when successful; otherwise, undefined.
 */
export async function getFileLink(
    getToken: TokenFetcher<OdspResourceTokenFetchOptions>,
    odspUrlParts: IOdspUrlParts,
    logger: ITelemetryLogger,
): Promise<string> {
    const cacheKey = `${odspUrlParts.siteUrl}_${odspUrlParts.driveId}_${odspUrlParts.itemId}`;
    const maybeFileLinkCacheEntry = fileLinkCache.get(cacheKey);
    if (maybeFileLinkCacheEntry !== undefined) {
        return maybeFileLinkCacheEntry;
    }

    const fileLinkGenerator = async function() {
        let fileLinkCore: string;
        try {
            fileLinkCore = await runWithRetry(
                async () => getFileLinkCore(getToken, odspUrlParts, logger),
                "getFileLinkCore",
                logger,
            );
        } catch (err) {
            // runWithRetry throws a non retriable error after it hits the max # of attempts
            // or encounters an unexpected error type
            if (!canRetryOnError(err)) {
                // Delete from the cache to permit retrying later.
                fileLinkCache.delete(cacheKey);
            }
            throw err;
        }

        // We are guaranteed to run the getFileLinkCore at least once with successful result (which must be a string)
        assert(fileLinkCore !== undefined, 0x292 /* "Unexpected undefined result from getFileLinkCore" */);
        return fileLinkCore;
    };
    const fileLink = fileLinkGenerator();
    fileLinkCache.set(cacheKey, fileLink);
    return fileLink;
}

async function getFileLinkCore(
    getToken: TokenFetcher<OdspResourceTokenFetchOptions>,
    odspUrlParts: IOdspUrlParts,
    logger: ITelemetryLogger,
): Promise<string> {
    const fileItem = await getFileItemLite(getToken, odspUrlParts, logger, true);

    // ODSP link requires extra call to return link that is resistant to file being renamed or moved to different folder
    return PerformanceEvent.timedExecAsync(
        logger,
        { eventName: "odspFileLink", requestName: "getSharingInformation" },
        async (event) => {
            let attempts = 0;
            let additionalProps;
            const fileLink = await getWithRetryForTokenRefresh(async (options) => {
                attempts++;
                const storageTokenFetcher = toInstrumentedOdspTokenFetcher(
                    logger,
                    odspUrlParts,
                    getToken,
                    true /* throwOnNullToken */,
                );
                const storageToken = await storageTokenFetcher(options, "GetFileLinkCore");
                assert(storageToken !== null,
                    0x2bb /* "Instrumented token fetcher with throwOnNullToken = true should never return null" */);

                const { url, headers } = getUrlAndHeadersWithAuth(
                    `${odspUrlParts.siteUrl}/_api/web/GetFileByUrl(@a1)/ListItemAllFields/GetSharingInformation?@a1=${
                        encodeURIComponent(`'${fileItem.webDavUrl}'`)
                    }`,
                    storageToken,
                    true,
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
                const { siteUrl, driveId, itemId } = odspUrlParts;
                const storageTokenFetcher = toInstrumentedOdspTokenFetcher(
                    logger,
                    odspUrlParts,
                    getToken,
                    true /* throwOnNullToken */,
                );
                const storageToken = await storageTokenFetcher(options, "GetFileItemLite");
                assert(storageToken !== null,
                    0x2bc /* "Instrumented token fetcher with throwOnNullToken =true should never return null" */);

                const { url, headers } = getUrlAndHeadersWithAuth(
                    `${siteUrl}/_api/v2.0/drives/${driveId}/items/${itemId}?select=webUrl,webDavUrl`,
                    storageToken,
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
