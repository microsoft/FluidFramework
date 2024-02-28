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

export interface SubscribeWebhookUrlApiRequest {
	subscriptionRequests: {
		/**
		 * Name of the webhook event to subscribe to
		 */
		eventName: WebhookEvent;
		/**
		 * The external URL to be pinged when the given event fires
		 */
		url: string;
	}[];
}
export type SubscribeWebhookUrlApiResponse = SubscribeWebhookUrlApiRequest;

export function createSubscribeWebhookUrlApiRoute(webhookManager: IWebhookManager, router: Router) {
	router.post("/subscribe", (request, response) => {
		const apiRequest = request.body as SubscribeWebhookUrlApiRequest;
		if (
			apiRequest.subscriptionRequests === undefined ||
			!Array.isArray(apiRequest.subscriptionRequests) ||
			apiRequest.subscriptionRequests.length === 0
		) {
			response.status(400).json({ message: "No subscription requests were provided" });
			return;
		}

		apiRequest.subscriptionRequests.forEach((subscriptionRequest) => {
			if (!isWebhookEvent(subscriptionRequest.eventName)) {
				response
					.status(400)
					.json({ message: `Invalid event name: ${subscriptionRequest.eventName}` });
				return;
			}

			if (
				webhookManager
					.getSubscriptions(subscriptionRequest.eventName)
					.has(subscriptionRequest.url)
			) {
				response.status(400).json({
					message: `Url ${subscriptionRequest.url} is already subscribed to event name: ${subscriptionRequest.eventName}`,
				});
				return;
			}
		});

		apiRequest.subscriptionRequests.forEach((subRequest) => {
			webhookManager.subscribe(subRequest.url, subRequest.eventName);
		});

		const apiResponse: SubscribeWebhookUrlApiResponse = apiRequest;
		response.status(200).json(apiResponse);
	});

	return router;
}
