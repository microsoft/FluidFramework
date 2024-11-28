/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITicketedMessage } from "./messages";
import { IProducer } from "./queue";

/**
 * Combines multiple producers to one.
 * This produces messages to all the producers.
 * It can produce the messages parallelly or sequentially.
 *
 * When producing parallelly, it will produce the messages to all the producers at once.
 * It will wait for all the sends to complete before resolving.
 *
 * When producing sequentially, it will produce the messages to each producer one
 * after another in order of the producers argument.
 * It will wait for each send to complete before sending the message to the next producer.
 * @internal
 */
export class CombinedProducer<T = ITicketedMessage> implements IProducer<T> {
	constructor(
		private readonly producers: IProducer<T>[],
		private readonly parallel: boolean,
	) {}

	/**
	 * Returns true if the producer is connected
	 */
	public isConnected(): boolean {
		return this.producers.every((producer) => producer.isConnected());
	}

	public async send(messages: T[], tenantId: string, documentId: string): Promise<any> {
		if (this.parallel) {
			// parallelly
			const sendP: Promise<void>[] = [];
			for (const producer of this.producers) {
				sendP.push(producer.send(messages, tenantId, documentId));
			}
			return Promise.all(sendP);
		} else {
			// sequentially
			for (const producer of this.producers) {
				await producer.send(messages, tenantId, documentId);
			}
		}
	}

	public async close(): Promise<void> {
		const closeP: Promise<void>[] = [];
		for (const producer of this.producers) {
			closeP.push(producer.close());
		}
		await Promise.all(closeP);
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
