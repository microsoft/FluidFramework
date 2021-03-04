/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger, ITelemetryProperties } from "@fluidframework/common-definitions";
import { PromiseCache } from "@fluidframework/common-utils";
import { canRetryOnError, getRetryDelayFromError } from "@fluidframework/driver-utils";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import { fetchAndParseAsJSONHelper, fetchHelper, getWithRetryForTokenRefresh, IOdspResponse } from "./odspUtils";
import {
    IdentityType,
    SharingLinkTokenFetchOptions,
    TokenFetcher,
    TokenFetchOptions,
    tokenFromResponse,
} from "./tokenFetch";

/**
 * This represents a lite version of GraphItem containing only the name, webUrl and webDavUrl properties
 */
export interface GraphItemLite {
    webUrl: string;
    webDavUrl: string;
    name: string;
}

function slashTerminatedOriginOrEmptyString(origin: string | undefined) {
    return origin
        ? origin.charAt(-1) === "/"
        ? origin
        : `${origin}/`
        : "";
}

const getSPOAndGraphRequestIdsFromResponse = async (headers: Map<string, string>) => {
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
};

/**
 * returns a promise that resolves after timeMs
 */
export async function delay(timeMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(() => resolve(), timeMs));
}

/**
 * Returns share link with requested scope and type for a file with given drive and item ids.
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
 * @param scope - access scope that will be granted via generated link. 'default' scope tells
 * server to use default access which is determined based on tenant settings
 * @param type - access type. This value is ignored when scope is set to either 'default' or 'existingAccess'
 * @param msGraphOrigin - If provided, base of URL to use for MS Graph API calls.
 * If not specified, https://graph.microsoft.com is used.
 * @returns Promise which resolves to share link url when successful; otherwise, undefined.
 */
export async function getShareLink(
    getToken: TokenFetcher<SharingLinkTokenFetchOptions>,
    siteUrl: string,
    driveId: string,
    itemId: string,
    identityType: IdentityType,
    logger: ITelemetryLogger,
    scope: "anonymous" | "organization" | "default" | "existingAccess" = "existingAccess",
    type: "view" | "edit" = "edit",
    msGraphOrigin?: string,
): Promise<string | undefined> {
    let result: string | undefined;
    let success = false;
    let retryAfter = 0;
    do {
        try {
            result = await getShareLinkCore(
                getToken, siteUrl, driveId, itemId, identityType, logger, scope, type, msGraphOrigin);
            success = true;
        } catch (err) {
            // If it is not retriable, then just throw the error.
            if (!canRetryOnError(err)) {
                throw err;
            }
            // If the error is throttling error, then wait for the specified time before retrying.
            // If the waitTime is not specified, then we start with retrying immediately to max of 8s.
            retryAfter = getRetryDelayFromError(err) ?? Math.min(retryAfter * 2, 8000);
            await delay(retryAfter);
        }
    } while (!success);
    return result;
}

export async function getShareLinkCore(
    getToken: TokenFetcher<SharingLinkTokenFetchOptions>,
    siteUrl: string,
    driveId: string,
    itemId: string,
    identityType: IdentityType,
    logger: ITelemetryLogger,
    scope: "anonymous" | "organization" | "default" | "existingAccess" = "existingAccess",
    type: "view" | "edit" = "edit",
    msGraphOrigin?: string,
): Promise<string | undefined> {
    if (scope === "existingAccess") {
        return getFileDefaultUrl(getToken, siteUrl, driveId, itemId, identityType, logger, msGraphOrigin);
    }

    const createShareLinkResponse = await graphFetch(
        async (options: TokenFetchOptions) => getToken({...options, siteUrl, type: "Graph"}),
        `${slashTerminatedOriginOrEmptyString(msGraphOrigin)}drives/${driveId}/items/${itemId}/createLink`,
        `GetShareLink_${scope}_${type}`,
        logger,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: scope === "default" ? undefined : JSON.stringify({ type, scope }),
        },
    );
    return createShareLinkResponse.content.link.webUrl;
}

/**
 * Issues a graph fetch request
 * @param getToken - Token provider than can supply Graph tokens
 * @param graphUrl - Url to fetch. Can either be a full URL (e.g. https://graph.microsoft.com/v1.0/me/people)
 *  or a partial url (e.g. me/people)
 * @param nameForLogging - Name used for logging
 * @param logger - used to log results of operation, including any error
 * @param requestInit - Request Init to be passed to fetch
 */
async function graphFetch(
    getToken: TokenFetcher<TokenFetchOptions>,
    graphUrl: string,
    nameForLogging: string,
    logger: ITelemetryLogger,
    requestInit?: RequestInit,
): Promise<IOdspResponse<IGraphFetchResponse>> {
    let tries = 0;
    const response = await PerformanceEvent.timedExecAsync(logger,
        { eventName: "odspFetchResponse", requestName: nameForLogging }, async (event) => {
            const odspResponse = await getWithRetryForTokenRefresh(async (options) => {
                tries++;
                const token = await getToken(options);
                const { url, headers } = getUrlAndHeadersWithAuth(
                    graphUrl.startsWith("http") ? graphUrl : `https://graph.microsoft.com/v1.0/${graphUrl}`,
                    tokenFromResponse(token),
                );
                const augmentedRequest = { ...requestInit };
                augmentedRequest.headers = { ...augmentedRequest.headers, ...headers };
                const res = await fetchAndParseAsJSONHelper<IGraphFetchResponse>(url, augmentedRequest);
                return res;
            },
        );
        const additionalProps = await getSPOAndGraphRequestIdsFromResponse(odspResponse.headers);
        event.end({ ...additionalProps, tries });
        return odspResponse;
    });
    return response;
}

/**
 * Returns default link for a file with given drive and item ids.
 * Scopes needed: files.read.all and {siteUrl}/files.readwrite.all
 * @param getToken - used to fetch access tokens needed to execute operation
 * @param siteUrl - SiteUrl of the site that contains the file
 * @param driveId - driveId that contains the file
 * @param itemId - ItemId of the file
 * @param identityType - type of client account
 * @param logger - Instance of the logger
 * @param msGraphOrigin - If provided, base of URL to use for MS Graph API calls.
 * If not specified, https://graph.microsoft.com is used.
 * @returns Promise which resolves to file url when successful; otherwise, undefined.
 */
async function getFileDefaultUrl(
    getToken: TokenFetcher<SharingLinkTokenFetchOptions>,
    siteUrl: string,
    driveId: string,
    itemId: string,
    identityType: IdentityType,
    logger: ITelemetryLogger,
    msGraphOrigin?: string,
): Promise<string | undefined> {
    const graphItem = await getGraphItemLite(
        async (options: TokenFetchOptions) => getToken({...options, siteUrl, type: "Graph"}),
        driveId,
        itemId,
        logger,
        msGraphOrigin,
    );
    if (!graphItem) {
        return undefined;
    }

    // ODC canonical link does not require any additional processing
    if (identityType === "Consumer") {
        return graphItem.webUrl;
    }

    let tries = 0;
    let additionalProps;
    // ODSP link requires extra call to return link that is resistant to file being renamed or moved to different folder
    const response = await PerformanceEvent.timedExecAsync(
        logger,
        { eventName: "odspFetchResponse", requestName: "getFileDefaultUrl" },
        async (event) => {
            const odspResponse = await getWithRetryForTokenRefresh(async (options) => {
                tries++;
                const token = await getToken({ ...options, siteUrl, type: "OneDrive" });
                const { url, headers } = getUrlAndHeadersWithAuth(
                    `${siteUrl}/_api/web/GetFileByUrl(@a1)/ListItemAllFields/GetSharingInformation?@a1=${
                        encodeURIComponent(`'${graphItem.webDavUrl}'`)
                    }`, tokenFromResponse(token));
                const requestInit = {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json;odata=verbose",
                        "Accept": "application/json;odata=verbose",
                        ...headers,
                    },
                };
                const res = await fetchHelper(url, requestInit);
                additionalProps = await getSPOAndGraphRequestIdsFromResponse(new Map(res.headers));
                const text = JSON.parse(await res.text());
                return text?.d?.directUrl as string;
            });
            event.end({ ...additionalProps, tries });
            return odspResponse;
        },
    );

    return response;
}

// Store details of the requested items for the lifetime of the app
const graphItemLiteCache = new PromiseCache<string, GraphItemLite | undefined>();

/**
 * This API gets only few properties representing the GraphItem - hence 'Lite'.
 * Scope needed: files.read.all
 * @param getToken - used to fetch access token needed to execute operation
 * @param driveId - ID for the drive that contains the file
 * @param itemId - ID of the file
 * @param logger - used to log results of operation, including any error
 * @param msGraphOrigin - If provided, base of URL to use for MS Graph API calls.
 * If not specified, https://graph.microsoft.com is used.
 * @returns Object containing name, webUrl and webDavUrl properties.
 * - name represents file name
 * - webUrl represents file url, this is url that can be used for direct loading of file on web. Primarily used
 * as canonical url for file residing in ODC
 * - webDavUrl represents file url in WebDAV standard, this url includes file path. This is needed for APIs
 * powering MRU and Share functionality.
 */
async function getGraphItemLite(
    getToken: TokenFetcher<TokenFetchOptions>,
    driveId: string,
    itemId: string,
    logger: ITelemetryLogger,
    msGraphOrigin?: string,
): Promise<GraphItemLite | undefined> {
    const cacheKey = `${driveId}_${itemId}`;
    if (graphItemLiteCache.has(cacheKey) === false) {
        const valueGenerator = async function() {
            const partialUrl = `${
                slashTerminatedOriginOrEmptyString(msGraphOrigin)
                }drives/${driveId}/items/${itemId}?select=webUrl,webDavUrl,name`;

            let response: IOdspResponse<GraphItemLite> | undefined;
            try {
                response = await graphFetch(getToken, partialUrl, "GetGraphItemLite", logger);
            } catch(error) {
                graphItemLiteCache.remove(cacheKey);
                return undefined;
            }

            try {
                const result = response?.content;
                if (result && result.webDavUrl && result.name) {
                    const liteGraphItemInfo: GraphItemLite = {
                        webUrl: result.webUrl,
                        webDavUrl: result.webDavUrl,
                        name: result.name,
                    };
                    return liteGraphItemInfo;
                } else {
                    return undefined;
                }
            } catch (error) {
                graphItemLiteCache.remove(cacheKey);
                return undefined;
            }
        };
        graphItemLiteCache.add(cacheKey, valueGenerator);
    }
    return graphItemLiteCache.get(cacheKey);
}

export interface IGraphFetchResponse {
    webUrl: string;
    webDavUrl: string;
    name: string;
    link: {
        webUrl: string;
    };
}
