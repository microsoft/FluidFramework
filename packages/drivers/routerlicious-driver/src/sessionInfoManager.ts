/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { getW3CData } from "@fluidframework/driver-base/internal";
import { IResolvedUrl } from "@fluidframework/driver-definitions/internal";
import { ISession } from "@fluidframework/server-services-client";
import {
	PerformanceEvent,
	ITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import { RouterliciousOrdererRestWrapper } from "./restWrapper.js";
import { getDiscoveredFluidResolvedUrl } from "./urlUtils.js";

/**
 * Amount of time between discoveries within which we don't need to rediscover on re-connect.
 * Currently, R11s defines session length at 10 minutes. To avoid any weird unknown edge-cases though,
 * we set the limit to 5 minutes here.
 * In the future, we likely want to retrieve this information from service's "inactive session" definition.
 */
export const RediscoverAfterTimeSinceDiscoveryMs = 5 * 60000; // 5 minutes

interface IGetSessionInfoParams {
	resolvedUrl: IResolvedUrl;
	documentId: string;
	tenantId: string;
	ordererRestWrapper: RouterliciousOrdererRestWrapper;
	logger: ITelemetryLoggerExt;
}

export interface IGetSessionInfoResponse {
	refreshed: boolean;
	resolvedUrl: IResolvedUrl;
}

export class SessionInfoManager {
	/**
	 * Stored session info
	 * Key: URL for given session (see "getDiscoverSessionUrl")
	 * Value: session info stored as an IResolvedUrl
	 */
	private readonly sessionInfoMap: Map<string, IResolvedUrl> = new Map();

	/**
	 * Stored dates of when a session was last discovered/refreshed
	 * Key: URL for given session (see "getDiscoverSessionUrl")
	 * Value: date last discovered
	 */
	private readonly sessionLastDiscoveredMap: Map<string, number> = new Map();

	constructor(private readonly enableDiscovery: boolean) {}

	/**
	 * Start tracking info for a given session
	 */
	public async initializeSessionInfo(
		params: IGetSessionInfoParams & { session: ISession | undefined },
	): Promise<IResolvedUrl> {
		const { resolvedUrl, session } = params;

		const url = getDiscoverSessionUrl(params);
		assert(
			this.sessionInfoMap.has(url) === this.sessionLastDiscoveredMap.has(url),
			0xa2d /* Session map state mismatch */,
		);

		if (session !== undefined) {
			this.sessionInfoMap.set(url, getDiscoveredFluidResolvedUrl(resolvedUrl, session));
			this.sessionLastDiscoveredMap.set(url, Date.now());
		} else if (!this.sessionInfoMap.has(url)) {
			this.sessionInfoMap.set(url, resolvedUrl);
			// Force a refresh
			this.sessionLastDiscoveredMap.set(url, 0);
		}

		return (await this.getSessionInfo(params)).resolvedUrl;
	}

	/**
	 * Retrieve, and potentially refresh, info of a given session
	 */
	public async getSessionInfo(
		params: IGetSessionInfoParams,
	): Promise<IGetSessionInfoResponse> {
		const url = getDiscoverSessionUrl(params);
		assert(
			this.sessionInfoMap.has(url) && this.sessionLastDiscoveredMap.has(url),
			0xa2e /* Unexpected discover session URL */,
		);

		let refreshed = false;
		const shouldRediscover =
			Date.now() - this.sessionLastDiscoveredMap.get(url)! >
			RediscoverAfterTimeSinceDiscoveryMs;
		if (this.enableDiscovery && shouldRediscover) {
			await this.fetchAndUpdateSessionInfo(params).catch((error) => {
				// Undo discovery time set on failure, so that next check refreshes.
				this.sessionLastDiscoveredMap.set(url, 0);
				throw error;
			});
			refreshed = true;
		}
		return {
			refreshed,
			// ! Shallow copy is important as some mechanisms may rely on object comparison
			resolvedUrl: { ...this.sessionInfoMap.get(url)! },
		};
	}

	private async fetchAndUpdateSessionInfo(params: IGetSessionInfoParams): Promise<void> {
		const { documentId, ordererRestWrapper, logger, resolvedUrl } = params;

		const url = getDiscoverSessionUrl(params);
		const discoveredSession = await PerformanceEvent.timedExecAsync(
			logger,
			{
				eventName: "DiscoverSession",
				docId: documentId,
			},
			async (event) => {
				// The service responds with the current document session associated with the container.
				const response = await ordererRestWrapper.get<ISession>(url);
				event.end({
					...response.propsToLog,
					...getW3CData(response.requestUrl, "xmlhttprequest"),
				});
				return response.content;
			},
		);
		this.sessionInfoMap.set(
			url,
			getDiscoveredFluidResolvedUrl(resolvedUrl, discoveredSession),
		);
		this.sessionLastDiscoveredMap.set(url, Date.now());
	}
}

function getDiscoverSessionUrl(params: {
	resolvedUrl: IResolvedUrl;
	tenantId: string;
	documentId: string;
}): string {
	const { resolvedUrl, tenantId, documentId } = params;
	return `${resolvedUrl.endpoints.ordererUrl}/documents/${tenantId}/session/${documentId}`;
}
