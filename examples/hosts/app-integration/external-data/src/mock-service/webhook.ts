/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fetch from "node-fetch";

import { IDisposable } from "@fluidframework/common-definitions";

import { ExternalDataSource } from "./externalData";

/**
 * Represents a webhook subscriber URL.
 * This is the URL that will be notified of the external data changes monitored by {@link MockWebhook}.
 */
export type SubscriberUrl = string;

/**
 * Mock implementation of a webhook configured to receive updates from an external data provider.
 */
export class MockWebhook implements IDisposable {
	/**
	 * Set of active subscribers.
	 * Values are the URLs that will be notified of changes.
	 */
	private readonly _subscribers: Set<SubscriberUrl>;

	/**
	 * Source of the external data we are interested in.
	 * When its data is updated, we will notify all of our subscribers of the changes.
	 */
	private readonly externalDataSource: ExternalDataSource;

	/**
	 * Mocks submitting notifications of changes to webhook subscribers.
	 *
	 * @remarks
	 * For now, we simply send a notification that data has changed.
	 * Consumers are expected to query for the actual data updates.
	 * This could be updated in the future to send the new data / just the delta as a part of the webhook payload.
	 */
	private readonly notifySubscribers: () => void = () => {
		console.log(
			`WEBHOOK: External data has been updated. Notifying ${this._subscribers.size} subscribers...`,
		);

		for (const subscriberUrl of this._subscribers) {
			fetch(subscriberUrl, {
				method: "POST",
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Content-Type": "application/json",
				},
				// TODO: body: New data / data change?
			}).catch((error) => {
				console.error("WEBHOOK: Encountered an error while notifying subscribers:", error);
			});
		}
	};

	/**
	 * {@inheritDoc MockWebhook.disposed}
	 */
	private _disposed: boolean;

	public constructor(externalDataSource: ExternalDataSource) {
		this._subscribers = new Set<SubscriberUrl>();

		this.externalDataSource = externalDataSource;

		this.externalDataSource.on("debugDataWritten", this.notifySubscribers);

		this._disposed = false;
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
		if (this._subscribers.has(subscriber)) {
			this._subscribers.delete(subscriber);
		} else {
			console.warn(`WEBHOOK: URL "${subscriber}" is not registered for data notifications.`);
		}
	}

	/**
	 * {@inheritDoc @fluidframework/common-definitions#IDisposable.dispose}
	 */
	public dispose(error?: Error | undefined): void {
		this.externalDataSource.off("debugDataWritten", this.notifySubscribers);
		this._disposed = true;
	}

	/**
	 * {@inheritDoc @fluidframework/common-definitions#IDisposable.disposed}
	 */
	public get disposed(): boolean {
		return this._disposed;
	}
}
