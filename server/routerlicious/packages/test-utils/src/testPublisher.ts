/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IPublisher, ITopic } from "@fluidframework/server-services-core";

/**
 * @internal
 */
export interface IEvent {
	event: string;
	args: any[];
}

/**
 * @internal
 */
export class TestTopic implements ITopic {
	public events = new Map<string, IEvent[]>();

	public emit(event: string, ...args: any[]) {
		if (!this.events.has(event)) {
			this.events.set(event, []);
		}

		this.events.get(event)?.push({ args, event });
	}

	public getEvents(key: string) {
		return this.events.get(key);
	}
}

/**
 * @internal
 */
export class TestPublisher implements IPublisher {
	private readonly events = new EventEmitter();
	private topics: { [topic: string]: TestTopic } = {};

	public on(event: string, listener: (...args: any[]) => void) {
		this.events.on(event, listener);
	}

	public to(topic: string): TestTopic {
		if (!(topic in this.topics)) {
			this.topics[topic] = new TestTopic();
		}

		return this.topics[topic];
	}

	public async close() {}
}
