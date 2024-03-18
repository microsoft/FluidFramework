/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType } from "@fluidframework/protocol-definitions";
import { BasicRestWrapper, generateToken } from "@fluidframework/server-services-client";
import { IWebhookManager, type ITenantManager } from "@fluidframework/server-services-core";
import { getCorrelationId } from "@fluidframework/server-services-utils";
import axios from "axios";

/**
 * Manages Webhooks and associated events
 */
export class WebhookManager implements IWebhookManager {
	// Map of webhook event names to URL's (webhooks)
	private readonly eventSubscriptions: Map<string, Set<string>>;
	private readonly internalHistorianUrl: string;
	private readonly tenantManager: ITenantManager;

	constructor(historianUrl: string, tenantManager: ITenantManager) {
		this.eventSubscriptions = new Map();
		this.internalHistorianUrl = historianUrl;
		this.tenantManager = tenantManager;
	}

	public getSubscriptions(eventName: string): Set<string> {
		return this.eventSubscriptions.get(eventName) ?? new Set();
	}

	public getAllSubscriptions() {
		return this.eventSubscriptions;
	}

	public subscribe(url: string, event: string) {
		let urlSubscriptions = this.eventSubscriptions.get(event);
		if (urlSubscriptions === undefined) {
			this.eventSubscriptions.set(event, new Set());
			urlSubscriptions = this.eventSubscriptions.get(event);
		}
		urlSubscriptions.add(url);
	}

	public unsubscribe(url: string, event: string) {
		let urlSubscriptions = this.eventSubscriptions.get(event);
		if (urlSubscriptions === undefined) {
			this.eventSubscriptions.set(event, new Set());
			urlSubscriptions = this.eventSubscriptions.get(event);
		}
		urlSubscriptions.delete(url);
	}

	public async handleEvent(event: string, payload: object) {
		const urlSubscriptions = this.eventSubscriptions.get(event) ?? new Set();
		for (const url of urlSubscriptions) {
			const response = await axios.post(url, payload);
			if (response.status !== 200) {
				console.warn(
					`Did not receieve successful response from Client url: ${url} for event: ${event}`,
				);
			} else {
				console.log(
					`Successfully send event payload response from Client url: ${url} for event: ${event}`,
				);
			}
		}
	}

	public async getLatestSummary(tenantId: string, documentId: string): Promise<string> {
		const restWrapper = await this.getBasicRestWrapper(tenantId, documentId);
		const requestUrl = `/repos/${tenantId}/git/summaries/latest?disableCache=true`;

		try {
			const response = await restWrapper.get<any>(requestUrl);
			const messages = response.data?.blobs
				// eslint-disable-next-line @typescript-eslint/no-unsafe-return
				.filter((e) => e.content.includes("blobs") && e.content.includes("content"))
				.map((e) => {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-return
					return e.content;
				});

			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return messages ?? "No Data";
		} catch (error) {
			console.log(`Error getting latest summary. ${JSON.stringify(error).substring(0, 300)}`);
		}
	}

	private async getBasicRestWrapper(tenantId: string, documentId: string) {
		const key = await this.tenantManager.getKey(tenantId);
		const getDefaultHeaders = () => {
			const jwtToken = generateToken(tenantId, documentId, key, [ScopeType.DocRead]);
			return {
				Authorization: `Basic ${jwtToken}`,
			};
		};

		const restWrapper = new BasicRestWrapper(
			this.internalHistorianUrl,
			undefined /* defaultQueryString */,
			undefined /* maxBodyLength */,
			undefined /* maxContentLength */,
			getDefaultHeaders(),
			undefined /* Axios */,
			undefined /* refreshDefaultQueryString */,
			getDefaultHeaders /* refreshDefaultHeaders */,
			getCorrelationId /* getCorrelationId */,
		);
		return restWrapper;
	}
}
