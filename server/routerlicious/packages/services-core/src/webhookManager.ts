/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Manages Webhooks and associated events
 */
export interface IWebhookManager {
	subscribe(url: string, event: string): void;
	unsubscribe(url: string, event: string): void;
	handleEvent(event: string, payload: unknown): void;
}

/**
 * Names of events related to collaborative sessions
 */
export const CollabSessionWebhookEvent = {
	SESSION_END: "SESSION_END",
} as const;
