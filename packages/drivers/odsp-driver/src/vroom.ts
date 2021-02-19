/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { ISocketStorageDiscovery } from "./contracts";
import { getWithRetryForTokenRefresh, getOrigin } from "./odspUtils";
import { getApiRoot } from "./odspUrlHelper";
import { TokenFetchOptions } from "./tokenFetch";
import { EpochTracker } from "./epochTracker";

/**
 * Makes join session call on SPO to get information about the web socket for a document
 * @param driveId - The SPO drive id that this request should be made against
 * @param itemId -The SPO item id that this request should be made against
 * @param siteUrl - The SPO site that this request should be made against
 * @param path - The API path that is relevant to this request
 * @param method - The type of request, such as GET or POST
 * @param logger - A logger to use for this request
 * @param getStorageToken - A function that is able to provide the access token for this request
 * @param epochTracker - fetch wrapper which incorporates epoch logic around joisSession call.
 */
export async function fetchJoinSession(
    driveId: string,
    itemId: string,
    siteUrl: string,
    path: string,
    method: string,
    logger: ITelemetryLogger,
    getStorageToken: (options: TokenFetchOptions, name?: string) => Promise<string | null>,
    epochTracker: EpochTracker,
): Promise<ISocketStorageDiscovery> {
    return getWithRetryForTokenRefresh(async (options) => {
        const token = await getStorageToken(options, "JoinSession");

        const extraProps = options.refresh
            ? { secondAttempt: 1, hasClaims: !!options.claims, hasTenantId: !!options.tenantId }
            : {};
        return PerformanceEvent.timedExecAsync(logger, { eventName: "JoinSession", ...extraProps }, async (event) => {
            // TODO Extract the auth header-vs-query logic out
            const siteOrigin = getOrigin(siteUrl);
            let queryParams = `access_token=${token}`;
            let headers = {};
            if (queryParams.length > 2048) {
                queryParams = "";
                headers = { Authorization: `Bearer ${token}` };
            }

            const response = await epochTracker.fetchAndParseAsJSON<ISocketStorageDiscovery>(
                `${getApiRoot(siteOrigin)}/drives/${driveId}/items/${itemId}/${path}?${queryParams}`,
                { method, headers },
                "joinSession",
            );

            // TODO SPO-specific telemetry
            event.end({
                sprequestguid: response.headers.get("sprequestguid"),
                sprequestduration: response.headers.get("sprequestduration"),
            });

            if (response.content.runtimeTenantId && !response.content.tenantId) {
                response.content.tenantId = response.content.runtimeTenantId;
            }

            return response.content;
        });
    });
}
