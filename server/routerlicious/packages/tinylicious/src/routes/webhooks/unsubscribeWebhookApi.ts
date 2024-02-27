/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import {
	IWebhookManager,
	WebhookEvent,
	isWebhookEvent,
} from "@fluidframework/server-services-core";

export interface UnsubscribeWebhookUrlApiRequest {
	/**
	 * ID of the Fluid document to unsubscribe to webhook events for
	 */
	documentId: string;
	unsubscribeRequests: {
		/**
		 * Name of the webhook event to unsubscribe from
		 */
		eventName: WebhookEvent;
		/**
		 * The external URL to be unsubscribed from the given webhook event
		 */
		url: string;
	}[];
}
export type UnsubscribeWebhookUrlApiResponse = UnsubscribeWebhookUrlApiRequest;

export function createUnsubscribeWebhookUrlApiRoute(
	router: Router,
	webhookManager: IWebhookManager,
) {
	router.post("unsubscribe", (request, response) => {
		const apiRequest = request.body as UnsubscribeWebhookUrlApiRequest;
		if (apiRequest.documentId === undefined) {
			response.status(400).json({ message: "Invalid or No document id was provided" });
		}

		if (
			apiRequest.unsubscribeRequests === undefined ||
			!Array.isArray(apiRequest.unsubscribeRequests) ||
			apiRequest.unsubscribeRequests.length === 0
		) {
			response.status(400).json({ message: "No unsubscription requests were provided" });
		}

		apiRequest.unsubscribeRequests.forEach((unsubscribeRequest) => {
			if (!isWebhookEvent(unsubscribeRequest.eventName)) {
				response
					.status(400)
					.json({ message: `Invalid event name: ${unsubscribeRequest.eventName}` });
			}

			if (
				!webhookManager
					.getSubscriptions(unsubscribeRequest.eventName)
					.has(unsubscribeRequest.url)
			) {
				response.status(400).json({
					message: `Url ${unsubscribeRequest.url} is not subscribed to event name: ${unsubscribeRequest.eventName}`,
				});
			}
		});

		apiRequest.unsubscribeRequests.forEach((unsubRequest) => {
			webhookManager.unsubscribe(unsubRequest.url, unsubRequest.eventName);
		});

		const apiResponse: UnsubscribeWebhookUrlApiResponse = apiRequest;
		response.status(200).json(apiResponse);
	});

	return router;
}
