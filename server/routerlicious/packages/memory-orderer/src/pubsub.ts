/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IWebSocket } from "@fluidframework/server-services-core";

/**
 * @internal
 */
export interface ISubscriber {
	id: string;
	readonly webSocket?: IWebSocket;
	send(topic: string, event: string, ...args: any[]): void;
}

/**
 * @internal
 */
export class WebSocketSubscriber implements ISubscriber {
	public get id(): string {
		return this.webSocket.id;
	}

	constructor(public readonly webSocket: IWebSocket) {}

	public send(topic: string, event: string, ...args: any[]): void {
		this.webSocket.emit(event, ...args);
	}
}

/**
 * @internal
 */
export interface IPubSub {
	// Registers a subscriber for the given message
	subscribe(topic: string, subscriber: ISubscriber): void;

	// Removes the subscriber
	unsubscribe(topic: string, subscriber: ISubscriber): void;

	// Publishes a message to the given topic
	publish(topic: string, event: string, ...args: any[]): void;
}

/**
 * @internal
 */
export class PubSub implements IPubSub {
	private readonly topics = new Map<
		string,
		Map<string, { subscriber: ISubscriber; count: number }>
	>();

	public publish(topic: string, event: string, ...args: any[]): void {
		const subscriptions = this.topics.get(topic);
		if (subscriptions) {
			for (const [, value] of subscriptions) {
				value.subscriber.send(topic, event, ...args);
			}
		}
	}

	// Subscribes to a topic. The same subscriber can be added multiple times. In this case we maintain a ref count
	// on the total number of times it has been subscribed. But we will only publish to it once.
	public subscribe(topic: string, subscriber: ISubscriber): void {
		if (!this.topics.has(topic)) {
			this.topics.set(topic, new Map<string, { subscriber: ISubscriber; count: number }>());
		}

		const subscriptions = this.topics.get(topic);
		if (!subscriptions?.has(subscriber.id)) {
			subscriptions?.set(subscriber.id, { subscriber, count: 0 });
		}
		const subscription = subscriptions?.get(subscriber.id);
		if (subscription) {
			subscription.count++;
		}
	}

	public unsubscribe(topic: string, subscriber: ISubscriber): void {
		assert(this.topics.has(topic));
		const subscriptions = this.topics.get(topic);

		assert(subscriptions?.has(subscriber.id));
		const details = subscriptions?.get(subscriber.id);
		if (details !== undefined) {
			details.count--;
			if (details.count === 0) {
				subscriptions?.delete(subscriber.id);
			}
		}
		if (subscriptions?.size === 0) {
			this.topics.delete(topic);
		}
	}
}
