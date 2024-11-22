/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
export class MockWebhook<TData = unknown> {
	/**
	 * Set of active subscribers.
	 * Values are the URLs that will be notified of changes.
	 */
	private readonly _subscribers: Set<SubscriberUrl>;

	public constructor() {
		this._subscribers = new Set<SubscriberUrl>();
	}

	/**
	 * Gets the current list of subscriber URLs.
	 */
	public get subscribers(): readonly SubscriberUrl[] {
		return [...this._subscribers.values()];
	}

	/**
	 * Registers a subscriber for external data updates.
	 */
	public registerSubscriber(subscriber: SubscriberUrl): void {
		if (this._subscribers.has(subscriber)) {
			console.warn(
				`EXTERNAL DATA SERVICE WEBHOOK: URL "${subscriber}" has already been registered for data notifications.`,
			);
		} else {
			this._subscribers.add(subscriber);
		}
	}

	/**
	 * De-registers the provided subscriber URL from future notifications.
	 */
	public removeSubscriber(subscriber: SubscriberUrl): void {
		if (this._subscribers.has(subscriber)) {
			this._subscribers.delete(subscriber);
		} else {
			console.warn(
				`EXTERNAL DATA SERVICE WEBHOOK: URL "${subscriber}" is not registered for data notifications.`,
			);
		}
	}

	/**
	 * Submits notifications of changes to webhook subscribers.
	 */
	public notifySubscribers(data: TData): void {
		console.log(
			`EXTERNAL DATA SERVICE WEBHOOK: External data has been updated. Notifying ${this._subscribers.size} subscribers...`,
		);
		const messageBody = JSON.stringify({ data });

		for (const subscriber of this._subscribers) {
			console.log(`EXTERNAL DATA SERVICE WEBHOOK: Notifying ${subscriber}`);

			fetch(subscriber, {
				method: "POST",
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Content-Type": "application/json",
				},
				body: messageBody,
			}).catch((error) => {
				console.error(
					"EXTERNAL DATA SERVICE WEBHOOK: Encountered an error while notifying subscribers:",
					error,
				);
			});
		}
	}
}
