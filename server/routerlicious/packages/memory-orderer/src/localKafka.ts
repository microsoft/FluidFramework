/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { IQueuedMessage, IProducer } from "@fluidframework/server-services-core";
import Deque from "double-ended-queue";
import { IKafkaSubscriber } from "./interfaces";
import { LocalKafkaSubscription } from "./localKafkaSubscription";

/**
 * Simple Kafka simulation
 * Lambdas can subscribe to messages.
 * Each subscription keeps track of its offset in the queue.
 * Queue is cleaned up once all subscriptions processed past the min.
 * @internal
 */
export class LocalKafka implements IProducer {
	private readonly subscriptions: LocalKafkaSubscription[] = [];

	private readonly qeueue = new Deque<IQueuedMessage>();

	private minimumQueueOffset = 0;

	constructor(private messageOffset = 0) {}

	public get length() {
		return this.qeueue.length;
	}

	public isConnected() {
		return true;
	}

	public subscribe(kafakaSubscriber: IKafkaSubscriber) {
		const kafkaSubscription = new LocalKafkaSubscription(kafakaSubscriber, this.qeueue);
		kafkaSubscription.on("processed", (queueOffset) => {
			if (this.minimumQueueOffset >= queueOffset) {
				return;
			}

			// Check if this queueOffset is the min
			for (const subscription of this.subscriptions) {
				if (subscription.queueOffset < queueOffset) {
					return;
				}
			}

			const diff = queueOffset - this.minimumQueueOffset;
			this.minimumQueueOffset = queueOffset - 1;

			// Remove items before min queue offset
			for (let i = 0; i < diff; i++) {
				this.qeueue.shift();
			}

			// Update offsets in each subscription to account for the queue index changing
			for (const subscription of this.subscriptions) {
				subscription.queueOffset -= diff;
			}
		});

		this.subscriptions.push(kafkaSubscription);
	}

	public async send(messages: object[], topic: string): Promise<any> {
		for (const message of messages) {
			const queuedMessage: IQueuedMessage = {
				offset: this.messageOffset,
				partition: 0,
				topic,
				value: JSON.stringify(message),
			};

			this.messageOffset++;

			this.qeueue.push(queuedMessage);
		}

		for (const subscription of this.subscriptions) {
			subscription.process().catch((error) => {
				Lumberjack.error("Error processing local kafka subscription", undefined, error);
			});
		}
	}

	public async close(): Promise<void> {
		this.qeueue.clear();

		for (const subscription of this.subscriptions) {
			subscription.close();
		}

		this.subscriptions.length = 0;
	}

	public on(event: "connected" | "produced" | "error", listener: (...args: any[]) => void): this {
		return this;
	}

	public once(
		event: "connected" | "produced" | "error",
		listener: (...args: any[]) => void,
	): this {
		return this;
	}

	public off(
		event: "connected" | "produced" | "error",
		listener: (...args: any[]) => void,
	): this {
		return this;
	}
}
