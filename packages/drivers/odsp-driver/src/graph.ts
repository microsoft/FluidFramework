/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger, ITelemetryProperties } from "@fluidframework/common-definitions";
import { PromiseCache } from "@fluidframework/common-utils";
import { authorizedFetchWithRetry } from "./authorizedFetchWithRetry";
import { RetryPolicy } from "./fetchWithRetry";
import { IdentityType, SharingLinkScopeFor, TokenFetchOptions } from "./tokenFetch";

/**
 * This represents a lite version of GraphItem containing only the name, webUrl and webDavUrl properties
 */
export interface GraphItemLite {
    webUrl: string;
    webDavUrl: string;
    name: string;
}

/**
 * Returns share link with requested scope and type for a file with given drive and item ids.
 * Scope needed: files.readwrite.all
 * @param getShareLinkToken - used to fetch access token needed to execute operation
 * @param siteUrl - url of the site that contains the file
 * @param driveId - drive where file is stored
 * @param itemId - file id
 * @param identityType - type of client account
 * @param logger - used to log results of operation, including any error
 * @param scope - access scope that will be granted via generated link. 'default' scope tells
 * server to use default access which is determined based on tenant settings
 * @param type - access type. This value is ignored when scope is set to either 'default' or 'existingAccess'
 * @returns Promise which resolves to share link url when successful; otherwise, undefined.
 */
export async function getShareLink(
    getShareLinkToken:
        (options: TokenFetchOptions, scopeFor: SharingLinkScopeFor, siteUrl: string) => Promise<string | null>,
    siteUrl: string,
    driveId: string,
    itemId: string,
    identityType: IdentityType,
    logger?: ITelemetryLogger,
    scope: "anonymous" | "organization" | "default" | "existingAccess" = "existingAccess",
    type: "view" | "edit" = "edit",
    msGraphOrigin?: string,
): Promise<string | undefined> {
    if (scope === "existingAccess") {
        return getFileDefaultUrl(getShareLinkToken, siteUrl, driveId, itemId, identityType, logger);
    }

    const origin = msGraphOrigin
        ? msGraphOrigin.charAt(-1) === "/"
        ? msGraphOrigin
        : `${msGraphOrigin}/`
        : "";

    const createShareLinkResponse = await graphFetch(
        getShareLinkToken,
        siteUrl,
        `${origin}drives/${driveId}/items/${itemId}/createLink`,
        `GetShareLink_${scope}_${type}`,
        logger,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: scope === "default" ? undefined : JSON.stringify({ type, scope }),
        },
    );

    if (createShareLinkResponse.ok) {
        const body = await createShareLinkResponse.json();
        return body.link.webUrl as string;
    }

    return undefined;
}

/**
 * Issues a graph fetch request
 * @param getShareLinkToken - Token provider than can supply Graph tokens
 * @param siteUrl - SiteUrl of the site that contains the file
 * @param graphUrl - Url to fetch. Can either be a full URL (e.g. https://graph.microsoft.com/v1.0/me/people)
 *  or a partial url (e.g. me/people)
 * @param nameForLogging - Name used for logging
 * @param logger - used to log results of operation, including any error
 * @param requestInit - Request Init to be passed to fetch
 * @param retryPolicy - Retry policy to be passed to fetchWithRetry
 * @param timeoutMs - Timeout value to be passed to fetchWithRetry
 */
export async function graphFetch(
    getShareLinkToken:
        (options: TokenFetchOptions, scopeFor: SharingLinkScopeFor, siteUrl: string) => Promise<string | null>,
    siteUrl: string,
    graphUrl: string,
    nameForLogging: string,
    logger?: ITelemetryLogger,
    requestInit?: RequestInit,
    retryPolicy?: RetryPolicy<Response>,
    timeoutMs = 0,
): Promise<Response> {
    const getToken = async (options: TokenFetchOptions) =>
        getShareLinkToken(
            options,
            SharingLinkScopeFor.nonFileDefaultUrl,
            siteUrl,
        );
    const url = graphUrl.startsWith("http") ? graphUrl : `https://graph.microsoft.com/v1.0/${graphUrl}`;
    return (
        await authorizedFetchWithRetry({
            getToken,
            url,
            requestInit,
            retryPolicy,
            timeoutMs,
            logger,
            nameForLogging,
            getAdditionalProps: getSPOAndGraphRequestIdsFromResponse,
        })
    ).result;
}

const getSPOAndGraphRequestIdsFromResponse = async (response: Response) => {
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
    if (response && response.headers) {
        headersToLog.forEach((header) => {
            const headerValue = response.headers.get(header.headerName);
            if (headerValue) {
                additionalProps[header.logName] = headerValue;
            }
        });
    }
    return additionalProps;
};

/**
 * Returns default link for a file with given drive and item ids.
 * Scopes needed: files.read.all and {siteOrigin}/files.readwrite.all
 * @param getShareLinkToken - used to fetch access token needed to execute operation
 * @param siteUrl - SiteUrl of the site that contains the file
 * @param driveId - driveId that contains the file
 * @param itemId - ItemId of the file
 * @param identityType - type of client account
 * @param logger - Instance of the logger
 * @returns Promise which resolves to file url when successful; otherwise, undefined.
 */
async function getFileDefaultUrl(
    getShareLinkToken:
        (options: TokenFetchOptions, scopeFor: SharingLinkScopeFor, siteUrl: string) => Promise<string | null>,
    siteUrl: string,
    driveId: string,
    itemId: string,
    identityType: IdentityType,
    logger?: ITelemetryLogger,
): Promise<string | undefined> {
    const graphItem = await getGraphItemLite(getShareLinkToken, siteUrl, driveId, itemId, logger);
    if (!graphItem) {
        return undefined;
    }

    // ODC canonical link does not require any additional processing
    if (identityType === "Consumer") {
        return graphItem.webUrl;
    }

    // ODSP link requires extra call to return link that is resistant to file being renamed or moved to different folder
    const fetchResponse = await authorizedFetchWithRetry({
        getToken: async (options) =>
            getShareLinkToken(options, SharingLinkScopeFor.fileDefaultUrl, siteUrl),
        url: `${siteUrl}/_api/web/GetFileByUrl(@a1)/ListItemAllFields/GetSharingInformation?@a1=${encodeURIComponent(
            `'${graphItem.webDavUrl}'`,
        )}`,
        requestInit: {
            method: "POST",
            headers: {
                "Content-Type": "application/json;odata=verbose",
                "Accept": "application/json;odata=verbose",
            },
        },
        logger,
        nameForLogging: "GetFileDefaultUrl",
        getAdditionalProps: getSPOAndGraphRequestIdsFromResponse,
    });

    if (fetchResponse.result.ok) {
        const body = await fetchResponse.result.json();
        return body.d.directUrl as string;
    }

    return undefined;
}

// Store details of the requested items for the lifetime of the app
const graphItemLiteCache = new PromiseCache<string, GraphItemLite | undefined>();

/**
 * This API gets only few properties representing the GraphItem - hence 'Lite'.
 * Scope needed: files.read.all
 * @param getShareLinkToken - used to fetch access token needed to execute operation
 * @param siteUrl - SiteUrl of the site that contains the file
 * @param driveId - ID for the drive that contains the file
 * @param itemId - ID of the file
 * @param logger - used to log results of operation, including any error
 * @returns Object containing name, webUrl and webDavUrl properties.
 * - name represents file name
 * - webUrl represents file url, this is url that can be used for direct loading of file on web. Primarily used
 * as canonical url for file residing in ODC
 * - webDavUrl represents file url in WebDAV standard, this url includes file path. This is needed for APIs
 * powering MRU and Share functionality.
 */
export async function getGraphItemLite(
    getShareLinkToken:
        (options: TokenFetchOptions, scopeFor: SharingLinkScopeFor, siteUrl: string) => Promise<string | null>,
    siteUrl: string,
    driveId: string,
    itemId: string,
    logger?: ITelemetryLogger,
): Promise<GraphItemLite | undefined> {
    const cacheKey = `${driveId}_${itemId}`;
    if (graphItemLiteCache.has(cacheKey) === false) {
        const valueGenerator = async function() {
            const partialUrl = `drives/${driveId}/items/${itemId}?select=webUrl,webDavUrl,name`;

            let response: Response | undefined;
            try {
                response = await graphFetch(getShareLinkToken, siteUrl, partialUrl, "GetGraphItemLite", logger);
            } catch { }

            // Cache only if we got a response and the response was a 200 (success) or 404 (NotFound)
            if (!response || (response.status !== 200 && response.status !== 404)) {
                graphItemLiteCache.remove(cacheKey);
                return undefined;
            } else {
                try {
                    const result: any = await response.json();
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
            }
        };
        graphItemLiteCache.add(cacheKey, valueGenerator);
    }
    return graphItemLiteCache.get(cacheKey);
}
