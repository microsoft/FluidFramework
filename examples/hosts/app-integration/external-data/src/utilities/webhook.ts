/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fetch from "node-fetch";

import { IDisposable } from "@fluidframework/common-definitions";
import { UsageError } from "@fluidframework/driver-utils";

/**
 * Represents a webhook subscriber URL.
 * This is the URL that will be notified of the external data changes monitored by {@link MockWebhook}.
 */
export type SubscriberUrl = string;

/**
 * Mock webhook manager.
 * Can be registered with to receive notifications when {@link MockWebhook.notifySubscribers} is called.
 *
 * @typeParam TData - The kind of data that will be sent alongside notifications to subscribers.
 * Must be JSON-serializable.
 */
export class MockWebhook<TData = unknown> implements IDisposable {
	/**
	 * Set of active subscribers.
	 * Values are the URLs that will be notified of changes.
	 */
	private readonly _subscribers: Set<SubscriberUrl>;

	/**
	 * {@inheritDoc MockWebhook.disposed}
	 */
	private _disposed: boolean;

	public constructor() {
		this._subscribers = new Set<SubscriberUrl>();
		this._disposed = false;
	}

	/**
	 * Gets the current list of subscriber URLs.
	 */
	public get subscribers(): readonly SubscriberUrl[] {
		if (this.disposed) {
			throw new UsageError("Webhook has been disposed.");
		}

		return [...this._subscribers.values()];
	}

	/**
	 * Registers a subscriber for external data updates.
	 */
	public registerSubscriber(subscriber: SubscriberUrl): void {
		if (this.disposed) {
			throw new UsageError("Webhook has been disposed.");
		}

		if (this._subscribers.has(subscriber)) {
			console.warn(
				`WEBHOOK: URL "${subscriber}" has already been registered for data notifications.`,
			);
		} else {
			this._subscribers.add(subscriber);
		}
	}

	/**
	 * De-registers the provided subscriber URL from future notifications.
	 */
	public removeSubscriber(subscriber: SubscriberUrl): void {
		if (this.disposed) {
			throw new UsageError("Webhook has been disposed.");
		}

		if (this._subscribers.has(subscriber)) {
			this._subscribers.delete(subscriber);
		} else {
			console.warn(`WEBHOOK: URL "${subscriber}" is not registered for data notifications.`);
		}
	}

	/**
	 * Submits notifications of changes to webhook subscribers.
	 */
	public notifySubscribers(data: TData): void {
		if (this.disposed) {
			throw new UsageError("Webhook has been disposed.");
		}

		console.log(
			`WEBHOOK: External data has been updated. Notifying ${this._subscribers.size} subscribers...`,
		);

        const messageBody = JSON.stringify({ data });
		for (const subscriberUrl of this._subscribers) {
			fetch(subscriberUrl, {
				method: "POST",
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Content-Type": "application/json",
				},
				body: messageBody
			}).catch((error) => {
				console.error("WEBHOOK: Encountered an error while notifying subscribers:", error);
			});
		}
	}

	/**
	 * {@inheritDoc @fluidframework/common-definitions#IDisposable.dispose}
	 */
	public dispose(error?: Error | undefined): void {
		if (this.disposed) {
			throw new UsageError("Webhook was already disposed.");
		}

		this._subscribers.clear();
		this._disposed = true;
	}

	/**
	 * {@inheritDoc @fluidframework/common-definitions#IDisposable.disposed}
	 */
	public get disposed(): boolean {
		return this._disposed;
	}
}
