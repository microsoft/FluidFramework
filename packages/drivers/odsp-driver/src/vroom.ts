/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseProperties } from "@fluidframework/core-interfaces";
import {
	IOdspUrlParts,
	ISocketStorageDiscovery,
	InstrumentedStorageTokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import {
	ITelemetryLoggerExt,
	PerformanceEvent,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import { EpochTracker } from "./epochTracker.js";
import { getApiRoot } from "./odspUrlHelper.js";
import { TokenFetchOptionsEx } from "./odspUtils.js";
import { runWithRetry } from "./retryUtils.js";

interface IJoinSessionBody {
	requestSocketToken: boolean;
	guestDisplayName?: string;
}

/**
 * Makes join session call on SPO to get information about the web socket for a document
 * @param urlParts - The SPO drive id, itemId, siteUrl that this request should be made against
 * @param path - The API path that is relevant to this request
 * @param method - The type of request, such as GET or POST
 * @param logger - A logger to use for this request
 * @param getAuthHeader - A function that is able to provide the access token for this request
 * @param epochTracker - fetch wrapper which incorporates epoch logic around joinSession call
 * @param requestSocketToken - flag indicating whether joinSession is expected to return access token
 * which is used when establishing websocket connection with collab session backend service.
 * @param options - Options to fetch the token.
 * @param disableJoinSessionRefresh - Whether the caller wants to disable refreshing join session periodically.
 * @param isRefreshingJoinSession - whether call is to refresh the session before expiry.
 * @param guestDisplayName - display name used to identify guest user joining a session.
 * This is optional and used only when collab session is being joined via invite.
 */
export async function fetchJoinSession(
	urlParts: IOdspUrlParts,
	path: string,
	method: "GET" | "POST",
	logger: ITelemetryLoggerExt,
	getAuthHeader: InstrumentedStorageTokenFetcher,
	epochTracker: EpochTracker,
	requestSocketToken: boolean,
	options: TokenFetchOptionsEx,
	disableJoinSessionRefresh: boolean | undefined,
	isRefreshingJoinSession: boolean,
): Promise<ISocketStorageDiscovery> {
	const apiRoot = getApiRoot(new URL(urlParts.siteUrl));
	const url = `${apiRoot}/drives/${urlParts.driveId}/items/${urlParts.itemId}/${path}?ump=1`;
	const authHeader = await getAuthHeader(
		{ ...options, request: { url, method } },
		"JoinSession",
	);

	const tokenRefreshProps = options.refresh
		? { hasClaims: !!options.claims, hasTenantId: !!options.tenantId }
		: {};
	const details: ITelemetryBaseProperties = {
		refreshedToken: options.refresh,
		requestSocketToken,
		...tokenRefreshProps,
		refreshingSession: isRefreshingJoinSession,
	};

	return PerformanceEvent.timedExecAsync(
		logger,
		{
			eventName: "JoinSession",
			attempts: options.refresh ? 2 : 1,
			details: JSON.stringify(details),
			...tokenRefreshProps,
		},
		async (event) => {
			const formBoundary = uuid();
			let postBody = `--${formBoundary}\r\n`;
			postBody += `Authorization: ${authHeader}\r\n`;
			postBody += `X-HTTP-Method-Override: POST\r\n`;
			postBody += `Content-Type: application/json\r\n`;
			if (!disableJoinSessionRefresh) {
				postBody += `prefer: FluidRemoveCheckAccess\r\n`;
			}
			postBody += `_post: 1\r\n`;

			if (requestSocketToken) {
				const body: IJoinSessionBody = {
					requestSocketToken: true,
				};
				postBody += `\r\n${JSON.stringify(body)}\r\n`;
			}
			postBody += `\r\n--${formBoundary}--`;
			const headers: { [index: string]: string } = {
				"Content-Type": `multipart/form-data;boundary=${formBoundary}`,
			};

			const response = await runWithRetry(
				async () =>
					epochTracker.fetchAndParseAsJSON<ISocketStorageDiscovery>(
						url,
						{ method, headers, body: postBody },
						"joinSession",
						true,
					),
				"joinSession",
				logger,
			);

			const socketUrl = response.content.deltaStreamSocketUrl;
			// expecting socketUrl to be something like https://{hostName}/...
			const webSocketHostName = socketUrl.split("/")[2];

			// TODO SPO-specific telemetry
			event.end({
				...response.propsToLog,
				// pushV2 websocket urls will contain pushf
				pushv2: socketUrl.includes("pushf"),
				webSocketHostName,
				refreshSessionDurationSeconds: response.content.refreshSessionDurationSeconds,
			});

			if (response.content.runtimeTenantId && !response.content.tenantId) {
				response.content.tenantId = response.content.runtimeTenantId;
			}

			return response.content;
		},
	);
}
