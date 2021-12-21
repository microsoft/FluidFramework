/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { InstrumentedStorageTokenFetcher, IOdspUrlParts } from "@fluidframework/odsp-driver-definitions";
import { ISocketStorageDiscovery } from "./contracts";
import { getOrigin, TokenFetchOptionsEx } from "./odspUtils";
import { getApiRoot } from "./odspUrlHelper";
import { EpochTracker } from "./epochTracker";
import { runWithRetry } from "./retryUtils";

interface IJoinSessionBody {
    requestSocketToken?: boolean;
    guestDisplayName?: string;
}

/**
 * Makes join session call on SPO to get information about the web socket for a document
 * @param urlParts - The SPO drive id, itemId, siteUrl that this request should be made against
 * @param path - The API path that is relevant to this request
 * @param method - The type of request, such as GET or POST
 * @param logger - A logger to use for this request
 * @param getStorageToken - A function that is able to provide the access token for this request
 * @param epochTracker - fetch wrapper which incorporates epoch logic around joinSession call
 * @param requestSocketToken - flag indicating whether joinSession is expected to return access token
 * which is used when establishing websocket connection with collab session backend service.
 * @param options - Options to fetch the token.
 * @param guestDisplayName - display name used to identify guest user joining a session.
 * This is optional and used only when collab session is being joined via invite.
 */
export async function fetchJoinSession(
    urlParts: IOdspUrlParts,
    path: string,
    method: string,
    logger: ITelemetryLogger,
    getStorageToken: InstrumentedStorageTokenFetcher,
    epochTracker: EpochTracker,
    requestSocketToken: boolean,
    options: TokenFetchOptionsEx,
    guestDisplayName?: string,
): Promise<ISocketStorageDiscovery> {
    const token = await getStorageToken(options, "JoinSession");

    const extraProps = options.refresh
        ? { hasClaims: !!options.claims, hasTenantId: !!options.tenantId }
        : {};
    return PerformanceEvent.timedExecAsync(
        logger, {
            eventName: "JoinSession",
            attempts: options.refresh ? 2 : 1,
            ...extraProps,
        },
        async (event) => {
            // TODO Extract the auth header-vs-query logic out
            const siteOrigin = getOrigin(urlParts.siteUrl);
            let queryParams = `access_token=${token}`;
            let headers = {};
            if (queryParams.length > 2048) {
                queryParams = "";
                headers = { Authorization: `Bearer ${token}` };
            }
            let body: IJoinSessionBody | undefined;
            if (requestSocketToken || guestDisplayName) {
                body = {};
                if (requestSocketToken) {
                    body.requestSocketToken = true;
                }
                if (guestDisplayName) {
                    body.guestDisplayName = guestDisplayName;
                }
                // IMPORTANT: Must set content-type header explicitly to application/json when request has body.
                // By default, request will use text/plain as content-type and will be rejected by backend.
                headers["Content-Type"] = "application/json";
            }

            const response = await runWithRetry(
                async () => epochTracker.fetchAndParseAsJSON<ISocketStorageDiscovery>(
                    `${getApiRoot(siteOrigin)}/drives/${
                        urlParts.driveId
                    }/items/${urlParts.itemId}/${path}?${queryParams}`,
                    { method, headers, body: body ? JSON.stringify(body) : undefined },
                    "joinSession",
                ),
                "joinSession",
                logger,
            );

            const socketUrl = response.content.deltaStreamSocketUrl;
            // expecting socketUrl to be something like https://{hostName}/...
            const webSocketHostName = socketUrl.split("/")[2];

            // TODO SPO-specific telemetry
            event.end({
                ...response.commonSpoHeaders,
                // pushV2 websocket urls will contain pushf
                pushv2: socketUrl.includes("pushf"),
                webSocketHostName,
            });

            if (response.content.runtimeTenantId && !response.content.tenantId) {
                response.content.tenantId = response.content.runtimeTenantId;
            }

            return response.content;
        });
}
