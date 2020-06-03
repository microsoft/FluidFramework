/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { PerformanceEvent } from "@fluidframework/telemetry";
import { ISocketStorageDiscovery } from "./contracts";
import { fetchHelper, getWithRetryForTokenRefresh, throwOdspNetworkError, getOrigin } from "./odspUtils";
import { getApiRoot } from "./odspUrlHelper";

/**
 * Makes join session call on SPO to get information about the web socket for a document
 * @param driveId - The SPO drive id that this request should be made against
 * @param itemId -The SPO item id that this request should be made against
 * @param siteUrl - The SPO site that this request should be made against
 * @param path - The API path that is relevant to this request
 * @param method - The type of request, such as GET or POST
 * @param logger - A logger to use for this request
 * @param getVroomToken - A function that is able to provide the vroom token for this request
 */
export async function fetchJoinSession(
    driveId: string,
    itemId: string,
    siteUrl: string,
    path: string,
    method: string,
    logger: ITelemetryLogger,
    getVroomToken: (refresh: boolean, name?: string) => Promise<string | undefined | null>,
): Promise<ISocketStorageDiscovery> {
    return getWithRetryForTokenRefresh(async (refresh: boolean) => {
        const token = await getVroomToken(refresh, "JoinSession");
        if (!token) {
            throwOdspNetworkError("Failed to acquire Vroom token", 400, true);
        }

        const extraProps = refresh ? { secondAttempt: 1 } : {};
        const joinSessionEvent = PerformanceEvent.start(logger, { eventName: "JoinSession", ...extraProps });
        try {
            // TODO Extract the auth header-vs-query logic out
            const siteOrigin = getOrigin(siteUrl);
            let queryParams = `access_token=${token}`;
            let headers = {};
            if (queryParams.length > 2048) {
                queryParams = "";
                headers = { Authorization: `Bearer ${token}` };
            }

            const response = await fetchHelper(
                `${getApiRoot(siteOrigin)}/drives/${driveId}/items/${itemId}/${path}?${queryParams}`,
                { method, headers },
            );

            // TODO SPO-specific telemetry
            joinSessionEvent.end({
                sprequestguid: response.headers.get("sprequestguid"),
                sprequestduration: response.headers.get("sprequestduration"),
            });

            if (response.content.runtimeTenantId && !response.content.tenantId) {
                response.content.tenantId = response.content.runtimeTenantId;
            }

            return response.content;
        } catch (error) {
            joinSessionEvent.cancel({}, error);
            throw error;
        }
    });
}
