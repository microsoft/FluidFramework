/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as kafka from "node-rdkafka";

import { BoxcarType, IBoxcarMessage, IPendingBoxcar, IProducer } from "@fluidframework/server-services-core";

import { IKafkaEndpoints, RdkafkaBase } from "./rdkafkaBase";
import { PendingBoxcar, MaxBatchSize } from "./pendingBoxcar";

/**
 * Kafka producer using the node-rdkafka library
 */
export class RdkafkaProducer extends RdkafkaBase implements IProducer {
	private readonly messages = new Map<string, IPendingBoxcar[]>();
	private producer?: kafka.HighLevelProducer;
	private sendPending?: NodeJS.Immediate;
	private connecting = false;
	private connected = false;

	constructor(
		endpoints: IKafkaEndpoints,
		clientId: string,
		topic: string,
		private readonly enableIdempotence: boolean = false,
		private readonly pollIntervalMs: number = 10,
		numberOfPartitions?: number,
		replicationFactor?: number) {
		super(endpoints, clientId, topic, numberOfPartitions, replicationFactor);
	}

	/**
	 * Creates a connection to Kafka. Will reconnect on failure.
	 */
	protected connect() {
		// Exit out if we are already connected or are in the process of connecting
		if (this.connected || this.connecting) {
			return;
		}

		this.connecting = true;

		this.producer = new kafka.HighLevelProducer({
			"metadata.broker.list": this.endpoints.kafka.join(","),
			"socket.keepalive.enable": true,
			"socket.nagle.disable": true,
			"client.id": this.clientId,
			"enable.idempotence": this.enableIdempotence,
			"queue.buffering.max.messages": 100000,
			"queue.buffering.max.ms": 0.5,
			"batch.num.messages": 10000,
		});

		this.producer.on("ready", () => {
			this.connected = true;
			this.connecting = false;

			this.emit("connected");

			this.sendPendingMessages();
		});

		this.producer.on("disconnected", () => {
			this.connected = false;
			this.connecting = false;

			this.emit("disconnected");
		});

		this.producer.on("connection.failure", (error) => {
			// eslint-disable-next-line @typescript-eslint/no-floating-promises
			this.handleError(error);
		});

		this.producer.on("event.error", (error) => {
			// eslint-disable-next-line @typescript-eslint/no-floating-promises
			this.handleError(error);
		});

		this.producer.on("event.throttle", (event) => {
			this.emit("throttled", event);
		});

		this.producer.connect();

		this.producer.setPollInterval(this.pollIntervalMs);
	}

	public async close(): Promise<void> {
		await new Promise((resolve) => {
			if (this.producer && this.producer.isConnected()) {
				this.producer.disconnect(resolve);
				this.producer = undefined;
			} else {
				resolve();
			}
		});
	}

	/**
	 * Sends the provided message to Kafka
	 */
	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public send(messages: object[], tenantId: string, documentId: string): Promise<any> {
		const key = `${tenantId}/${documentId}`;

		// Get the list of boxcars for the given key
		let boxcars = this.messages.get(key);
		if (!boxcars) {
			boxcars = [new PendingBoxcar(tenantId, documentId)];
			this.messages.set(key, boxcars);
		}

		// Create a new boxcar if necessary (will only happen when not connected)
		if (boxcars[boxcars.length - 1].messages.length + messages.length >= MaxBatchSize) {
			boxcars.push(new PendingBoxcar(tenantId, documentId));
		}

		// Add the message to the boxcar
		const boxcar = boxcars[boxcars.length - 1];
		boxcar.messages.push(...messages);

		// If adding a new message to the boxcar filled it up, and we are connected, then send immediately. Otherwise
		// request a send
		if (this.connected && boxcar.messages.length >= MaxBatchSize) {
			// Send all the boxcars
			this.sendBoxcars(boxcars);
			this.messages.delete(key);
		} else {
			// Mark the need to send a message
			this.requestSend();
		}

		return boxcar.deferred.promise;
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
		if (!this.producer) {
			throw new Error("Invalid producer");
		}

		for (const boxcar of boxcars) {
			const boxcarMessage: IBoxcarMessage = {
				contents: boxcar.messages,
				documentId: boxcar.documentId,
				tenantId: boxcar.tenantId,
				type: BoxcarType,
			};

			const message = Buffer.from(JSON.stringify(boxcarMessage));

			try {
				this.producer.produce(
					this.topic, // topic
					null, // partition - consistent random for keyed messages
					message, // message
					boxcar.documentId, // key
					undefined, // timestamp
					(err: any, offset?: number) => {
						if (err) {
							boxcar.deferred.reject(err);

							// eslint-disable-next-line @typescript-eslint/no-floating-promises
							this.handleError(err);

						} else {
							boxcar.deferred.resolve();
							this.emit("produced", boxcarMessage, offset);
						}
					},
				);

			} catch (ex) {
				// produce can throw if the outgoing message queue is full
				boxcar.deferred.reject(ex);

				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				this.handleError(ex);
			}
		}
	}

	/**
	 * Handles an error that requires a reconnect to Kafka
	 */
	private async handleError(error: any) {
		// Close the client if it exists
		await this.close();

		this.connecting = this.connected = false;

		this.emit("error", error);

		this.connect();
	}
}
