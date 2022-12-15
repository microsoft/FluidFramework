/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ExternalDataSource } from "../externalData";

/**
 * Represents a webhook subscriber URL.
 * This is the URL that will be notified of the external data changes monitored by {@link MockWebhook}.
 */
export type SubscriberUrl = string;

/**
 * Mock implementation of a webhook configured to receive updates from an external data provider.
 */
export class MockWebhook {
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
        console.log("External data has been updated. Notifying subscribers...");
        for (const subscriberUrl of this._subscribers) {
            // TODO: notify the subscriber of the data change.
        }
    }

    public constructor() {
        this._subscribers = new Set<SubscriberUrl>();
        this.externalDataSource = new ExternalDataSource();
        this.externalDataSource.on("debugDataWritten", this.notifySubscribers);
    }

    /**
     * Gets the current list of subscriber URLs.
     */
    public get subscribers(): readonly SubscriberUrl[] {
        return [...this._subscribers.values()];
    }
}
