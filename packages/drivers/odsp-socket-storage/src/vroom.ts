/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@microsoft/fluid-common-definitions";
import { PerformanceEvent } from "@microsoft/fluid-core-utils";
import { ISocketStorageDiscovery } from "./contracts";
import { OdspCache } from "./odspCache";
import { fetchHelper, getWithRetryForTokenRefresh, IOdspResponse, throwOdspNetworkError } from "./odspUtils";

const getOrigin = (url: string) => new URL(url).origin;

/**
 * Makes join session call on SPO
 * @param appId - The identifier for the application
 * @param driveId - The SPO drive id that this request should be made against
 * @param itemId -The SPO item id that this request should be made against
 * @param siteUrl - The SPO site that this request should be made against
 * @param path - The API path that is relevant to this request
 * @param additionalParams - Additional URL parameters to append to this request
 * @param method - The type of request, such as GET or POST
 * @param retryPolicy - A strategy for re-attempting failed requests
 * @param nameForLogging - A name to use in the logs for this request
 * @param logger - A logger to use for this request
 * @param getVroomToken - A function that is able to provide the vroom token for this request
 */
export async function fetchJoinSession(
    appId: string,
    driveId: string,
    itemId: string,
    siteUrl: string,
    path: string,
    additionalParams: string,
    method: string,
    logger: ITelemetryLogger,
    getVroomToken: (refresh: boolean, name?: string) => Promise<string | undefined | null>,
): Promise<IOdspResponse<ISocketStorageDiscovery>> {
    return getWithRetryForTokenRefresh(async (refresh: boolean) => {
        const token = await getVroomToken(refresh, "JoinSession");
        if (!token) {
            throwOdspNetworkError("Failed to acquire Vroom token", 400, true);
        }

        const joinSessionEvent = PerformanceEvent.start(logger, { eventName: "JoinSession" });
        let response: IOdspResponse<ISocketStorageDiscovery>;
        try {
            // TODO Extract the auth header-vs-query logic out
            const siteOrigin = getOrigin(siteUrl);
            let queryParams = `app_id=${appId}&access_token=${token}${additionalParams ? `&${additionalParams}` : ""}`;
            let headers = {};
            if (queryParams.length > 2048) {
                queryParams = `app_id=${appId}${additionalParams ? `&${additionalParams}` : ""}`;
                headers = { Authorization: `Bearer ${token}` };
            }

            // TODO This will only support ODC using api.onedrive.com, update to handle the future (share links etc)
            let prefix = "_api/";
            if (siteOrigin.toLowerCase().includes(".onedrive.com")) {
                prefix = "";
            }

            response = await fetchHelper(
                `${siteOrigin}/${prefix}v2.1/drives/${driveId}/items/${itemId}/${path}?${queryParams}`,
                { method, headers },
            );
        } catch (error) {
            joinSessionEvent.cancel({}, error);
            throw error;
        }
        // TODO SPO-specific telemetry
        joinSessionEvent.end({
            sprequestguid: response.headers.get("sprequestguid"),
            sprequestduration: response.headers.get("sprequestduration"),
        });
        return response;
    });
}

/**
 * Runs join session to get information about the web socket for a document
 * @param appId - An identifier for the application
 * @param driveId - The drive id where the container is stored
 * @param itemId - The item id of the container
 * @param siteUrl - The site where the container is stored
 * @param logger - A logging implementation
 * @param isPushAuthV2 - A flag to control if pushAuthV2 is enabled
 * @param getVroomToken - A function that gets the Vroom token
 * @param getPushToken - A function that gets the push token
 */
export async function getSocketStorageDiscovery(
    appId: string,
    driveId: string,
    itemId: string,
    siteUrl: string,
    logger: ITelemetryLogger,
    getVroomToken: (refresh: boolean, name?: string) => Promise<string | undefined | null>,
    odspCache: OdspCache,
    joinSessionKey: string,
): Promise<ISocketStorageDiscovery> {
    // We invalidate the cache here because we will take the decision to put the joinsession result
    // again based on the last time it was put in the cache. So if the result is valid and used within
    // an hour we put the same result again with updated time so that we keep using the same result for
    // consecutive join session calls because the server moved. If there is nothing in cache or the
    // response was cached an hour ago, then we make the join session call again.
    const cachedResult: IOdspJoinSessionCachedItem = odspCache.get(joinSessionKey, true);
    if (cachedResult && Date.now() - cachedResult.timestamp <= 3600000 && cachedResult.content) {
        odspCache.put(joinSessionKey, { content: cachedResult.content, timestamp: Date.now() });
        return cachedResult.content;
    }

    const response: IOdspResponse<ISocketStorageDiscovery> = await fetchJoinSession(
        appId,
        driveId,
        itemId,
        siteUrl,
        "opStream/joinSession",
        "",
        "POST",
        logger,
        getVroomToken,
    );

    if (response.content.runtimeTenantId && !response.content.tenantId) {
        response.content.tenantId = response.content.runtimeTenantId;
    }
    // Never expire the joinsession result. On error, the delta connection will invalidate it.
    odspCache.put(joinSessionKey, { content: response.content, timestamp: Date.now() });

    return response.content;
}

interface IOdspJoinSessionCachedItem {
    content: ISocketStorageDiscovery;
    timestamp: number;
}
