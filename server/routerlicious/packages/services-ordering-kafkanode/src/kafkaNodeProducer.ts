/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import events_pkg from "events_pkg";
const { EventEmitter } = events_pkg;
import * as util from "util";
import {
	BoxcarType,
	IBoxcarMessage,
	IPendingBoxcar,
	IProducer,
	PendingBoxcar,
	MaxBatchSize,
} from "@fluidframework/server-services-core";
import { NetworkError } from "@fluidframework/server-services-client";
import * as kafka from "kafka-node";
import { ensureTopics } from "./kafkaTopics";

/**
 * Kafka producer using the kafka-node library
 * @internal
 */
export class KafkaNodeProducer implements IProducer {
	private readonly messages = new Map<string, IPendingBoxcar[]>();
	private client!: kafka.KafkaClient;
	private producer!: kafka.Producer;
	private sendPending?: NodeJS.Immediate;
	private readonly events = new EventEmitter();
	private connecting = false;
	private connected = false;
	private readonly maxBatchSize: number;
	private readonly maxMessageSize: number;

	constructor(
		private readonly clientOptions: kafka.KafkaClientOptions,
		clientId: string,
		private readonly topic: string,
		private readonly topicPartitions?: number,
		private readonly topicReplicationFactor?: number,
		maxBatchSize?: number,
		maxMessageSize?: number,
	) {
		clientOptions.clientId = clientId;
		this.maxBatchSize = maxBatchSize ?? MaxBatchSize;
		this.maxMessageSize = maxMessageSize ?? Number.MAX_SAFE_INTEGER;
		this.connect();
	}

	public isConnected() {
		return this.connected;
	}

	/**
	 * Sends the provided message to Kafka
	 */
	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public send(messages: object[], tenantId: string, documentId: string): Promise<any> {
		const key = `${tenantId}/${documentId}`;

		// Get the list of boxcars for the given key
		const existingBoxcars = this.messages.get(key);
		const boxcars: IPendingBoxcar[] = existingBoxcars ?? [
			new PendingBoxcar(tenantId, documentId),
		];
		if (!existingBoxcars) {
			this.messages.set(key, boxcars);
		}

		// Create a new boxcar if necessary (will only happen when not connected)
		if (boxcars[boxcars.length - 1].messages.length + messages.length >= this.maxBatchSize) {
			boxcars.push(new PendingBoxcar(tenantId, documentId));
		}

		// Add the message to the boxcar
		const boxcar = boxcars[boxcars.length - 1];
		boxcar.messages.push(...messages);

		// If adding a new message to the boxcar filled it up, and we are connected, then send immediately. Otherwise
		// request a send
		if (this.connected && boxcar.messages.length >= this.maxBatchSize) {
			// Send all the boxcars
			this.sendBoxcars(boxcars);
			this.messages.delete(key);
		} else {
			// Mark the need to send a message
			this.requestSend();
		}

		return boxcar.deferred.promise;
	}

	public async close(): Promise<void> {
		await util.promisify(((callback) => this.producer.close(callback)) as any)();
		await util.promisify(((callback) => this.client.close(callback)) as any)();
	}

	public on(event: "connected" | "produced" | "error", listener: (...args: any[]) => void): this {
		this.events.on(event, listener);
		return this;
	}

	public once(
		event: "connected" | "produced" | "error",
		listener: (...args: any[]) => void,
	): this {
		this.events.once(event, listener);
		return this;
	}

	public off(
		event: "connected" | "produced" | "error",
		listener: (...args: any[]) => void,
	): this {
		this.events.off(event, listener);
		return this;
	}

	/**
	 * Notifies of the need to send pending messages. We defer sending messages to batch together messages
	 * to the same partition.
	 */
	private requestSend() {
		// If we aren't connected yet defer sending until connected
		if (!this.connected) {
			return;
		}

		// Exit early if there is a pending send
		if (this.sendPending) {
			return;
		}

		// Use setImmediate to play well with the node event loop
		this.sendPending = setImmediate(() => {
			this.sendPendingMessages();
			this.sendPending = undefined;
		});
	}

	/**
	 * Sends all pending messages
	 */
	private sendPendingMessages() {
		for (const [, value] of this.messages) {
			this.sendBoxcars(value);
		}

		this.messages.clear();
	}

	private sendBoxcars(boxcars: IPendingBoxcar[]) {
		for (const boxcar of boxcars) {
			const boxcarMessage: IBoxcarMessage = {
				contents: boxcar.messages,
				documentId: boxcar.documentId,
				tenantId: boxcar.tenantId,
				type: BoxcarType,
			};

			const stringifiedMessage = Buffer.from(JSON.stringify(boxcarMessage));
			if (stringifiedMessage.byteLength > this.maxMessageSize) {
				const error = new NetworkError(
					413,
					`Boxcar message size (${stringifiedMessage.byteLength}) exceeded max message size (${this.maxMessageSize})`,
				);
				boxcar.deferred.reject(error);
				continue;
			}
			this.producer.send(
				[{ key: boxcar.documentId, messages: stringifiedMessage, topic: this.topic }],
				(error, data) => {
					if (error) {
						this.handleError(error);
						boxcar.deferred.reject(error);
					} else {
						this.events.emit("produced");
						boxcar.deferred.resolve();
					}
				},
			);
		}
	}

	/**
	 * Creates a connection to Kafka. Will reconnect on failure.
	 */
	private connect() {
		// Exit out if we are already connected or are in the process of connecting
		if (this.connected || this.connecting) {
			return;
		}

		this.connecting = true;

		this.client = new kafka.KafkaClient(this.clientOptions);
		this.producer = new kafka.Producer(this.client, { partitionerType: 3 });

		this.client.on("error", (error) => {
			this.handleError(error);
		});

		this.producer.on("ready", async () => {
			try {
				await ensureTopics(
					this.client,
					[this.topic],
					this.topicPartitions,
					this.topicReplicationFactor,
				);

				this.connected = true;
				this.connecting = false;

				this.events.emit("connected");

				this.sendPendingMessages();
			} catch (error) {
				this.handleError(error);
			}
		});

		this.producer.on("error", (error) => {
			this.handleError(error);
		});
	}

	/**
	 * Handles an error that requires a reconnect to Kafka
	 */
	private handleError(error: any) {
		// Close the client if it exists
		if (this.client) {
			this.client.close();
			// This gets re-assigned immediately in `this.connect()`
			this.client = undefined as unknown as kafka.KafkaClient;
		}

		this.connecting = this.connected = false;

		this.events.emit("error", error);
		this.connect();
	}
}
