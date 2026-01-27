/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { PubSub, type ISubscriber } from "../pubsub";

describe("PubSub", () => {
	let pubsub: PubSub;

	function createSubscriber(
		id: string,
	): ISubscriber & { messages: Array<{ topic: string; event: string; args: any[] }> } {
		const messages: Array<{ topic: string; event: string; args: any[] }> = [];
		return {
			id,
			messages,
			send(topic: string, event: string, ...args: any[]): void {
				messages.push({ topic, event, args });
			},
		};
	}

	beforeEach(() => {
		pubsub = new PubSub();
	});

	describe("subscribe and publish", () => {
		it("delivers messages to subscribers", () => {
			const subscriber = createSubscriber("sub1");
			pubsub.subscribe("topic1", subscriber);

			pubsub.publish("topic1", "event1", "arg1", "arg2");

			assert.strictEqual(subscriber.messages.length, 1);
			assert.strictEqual(subscriber.messages[0].topic, "topic1");
			assert.strictEqual(subscriber.messages[0].event, "event1");
			assert.deepStrictEqual(subscriber.messages[0].args, ["arg1", "arg2"]);
		});

		it("does not deliver messages to unsubscribed topics", () => {
			const subscriber = createSubscriber("sub1");
			pubsub.subscribe("topic1", subscriber);

			pubsub.publish("topic2", "event1");

			assert.strictEqual(subscriber.messages.length, 0);
		});

		it("handles multiple subscribers on same topic", () => {
			const subscriber1 = createSubscriber("sub1");
			const subscriber2 = createSubscriber("sub2");

			pubsub.subscribe("topic1", subscriber1);
			pubsub.subscribe("topic1", subscriber2);

			pubsub.publish("topic1", "event1");

			assert.strictEqual(subscriber1.messages.length, 1);
			assert.strictEqual(subscriber2.messages.length, 1);
		});
	});

	describe("unsubscribe", () => {
		it("removes subscriber from topic", () => {
			const subscriber = createSubscriber("sub1");
			pubsub.subscribe("topic1", subscriber);

			pubsub.unsubscribe("topic1", subscriber);

			pubsub.publish("topic1", "event1");
			assert.strictEqual(subscriber.messages.length, 0);
		});

		it("handles unsubscribe from non-existent topic gracefully", () => {
			const subscriber = createSubscriber("sub1");

			// Should not throw
			pubsub.unsubscribe("non-existent-topic", subscriber);
		});

		it("handles unsubscribe of non-existent subscriber gracefully", () => {
			const subscriber1 = createSubscriber("sub1");
			const subscriber2 = createSubscriber("sub2");

			pubsub.subscribe("topic1", subscriber1);

			// Should not throw - subscriber2 was never subscribed
			pubsub.unsubscribe("topic1", subscriber2);

			// subscriber1 should still receive messages
			pubsub.publish("topic1", "event1");
			assert.strictEqual(subscriber1.messages.length, 1);
		});

		it("handles double unsubscribe gracefully", () => {
			const subscriber = createSubscriber("sub1");
			pubsub.subscribe("topic1", subscriber);

			pubsub.unsubscribe("topic1", subscriber);
			// Should not throw
			pubsub.unsubscribe("topic1", subscriber);
		});

		it("handles ref counting for multiple subscriptions", () => {
			const subscriber = createSubscriber("sub1");

			// Subscribe twice
			pubsub.subscribe("topic1", subscriber);
			pubsub.subscribe("topic1", subscriber);

			// Unsubscribe once - should still be subscribed
			pubsub.unsubscribe("topic1", subscriber);

			pubsub.publish("topic1", "event1");
			assert.strictEqual(subscriber.messages.length, 1);

			// Unsubscribe again - now should be fully unsubscribed
			pubsub.unsubscribe("topic1", subscriber);

			pubsub.publish("topic1", "event2");
			assert.strictEqual(subscriber.messages.length, 1); // Still 1, not 2
		});

		it("cleans up empty topics", () => {
			const subscriber = createSubscriber("sub1");
			pubsub.subscribe("topic1", subscriber);

			pubsub.unsubscribe("topic1", subscriber);

			// Publishing to cleaned up topic should not throw
			pubsub.publish("topic1", "event1");
		});
	});
});
