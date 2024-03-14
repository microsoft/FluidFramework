/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Manages Webhooks and associated events
 */
export interface IWebhookManager {
	subscribe(url: string, event: WebhookEvent): void;
	unsubscribe(url: string, event: WebhookEvent): void;
	handleEvent(event: string, payload: IWebhookEventPayload): void;
	getSubscriptions(eventName: WebhookEvent): Set<string>;
}

/**
 * Interface for the data payload to be sent to a given webhook subscription.
 */
export interface IWebhookEventPayload {
	tenantId: string;
	documentId: string;
	eventName: WebhookEvent;
	[key: string]: any; // Allows for arbitrary key-value pairs
}

/**
 * Object containing names of all events related to collaborative sessions. Intended to be used like an enum
 */
export const CollabSessionWebhookEvents = {
	SESSION_END: "SESSION_END",
	SESSION_START: "SESSION_START",
	SESSION_CLIENT_JOIN: "SESSION_CLIENT_JOIN",
	SESSION_CLIENT_LEAVE: "SESSION_CLIENT_LEAVE",
} as const;

/**
 * The type for all {@link CollabSessionWebhookEvents} Webhook events
 */
export type CollabSessionWebhookEvent = keyof typeof CollabSessionWebhookEvents;

/**
 * Object containing names of all events related to Fluid summaries. Intended to be used like an enum
 */
export const SummaryWebhookEvents = {
	NEW_SUMMARY_CREATED: "NEW_SUMMARY_CREATED",
} as const;

/**
 * The type for all {@link SummaryWebhookEvents} Webhook events
 */
export type SummaryWebhookEvent = keyof typeof SummaryWebhookEvents;

/**
 * Exhaustive type for all Webhook events
 */
export type WebhookEvent = CollabSessionWebhookEvent | SummaryWebhookEvent;

/**
 * Type guard to determine if a given string is a valid {@link WebhookEvent}
 */
export function isWebhookEvent(value: string): value is WebhookEvent {
	if (Object.values(CollabSessionWebhookEvents).includes(value as any)) {
		return true;
	} else if (Object.values(SummaryWebhookEvents).includes(value as any)) {
		return true;
	}

	return false;
}
