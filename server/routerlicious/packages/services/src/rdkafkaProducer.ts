/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type * as kafkaTypes from "node-rdkafka";
import { BoxcarType, IBoxcarMessage, IPendingBoxcar, IProducer } from "@fluidframework/server-services-core";

import { IKafkaBaseOptions, IKafkaEndpoints, RdkafkaBase } from "./rdkafkaBase";
import { PendingBoxcar, MaxBatchSize } from "./pendingBoxcar";
import { tryImportNodeRdkafka } from "./tryImport";

const kafka = tryImportNodeRdkafka();

export interface IKafkaProducerOptions extends Partial<IKafkaBaseOptions> {
	enableIdempotence: boolean;
	pollIntervalMs: number;
	additionalOptions?: kafkaTypes.ProducerGlobalConfig;
	topicConfig?: kafkaTypes.ProducerTopicConfig;
}

/**
 * Kafka producer using the node-rdkafka library
 */
export class RdkafkaProducer extends RdkafkaBase implements IProducer {
	private readonly producerOptions: IKafkaProducerOptions;
	private readonly messages = new Map<string, IPendingBoxcar[]>();
	private producer?: kafkaTypes.Producer;
	private sendPending?: NodeJS.Immediate;
	private connecting = false;
	private connected = false;
	private closed = false;

	constructor(
		endpoints: IKafkaEndpoints,
		clientId: string,
		topic: string,
		options?: Partial<IKafkaProducerOptions>) {
		super(endpoints, clientId, topic, options);

		this.producerOptions = {
			...options,
			enableIdempotence: options?.enableIdempotence ?? false,
			pollIntervalMs: options?.pollIntervalMs ?? 10,
		};
	}

	/**
	 * Creates a connection to Kafka. Will reconnect on failure.
	 */
	protected connect() {
		// Exit out if we are already connected, are in the process of connecting, or closed
		if (this.connected || this.connecting || this.closed) {
			return;
		}

		this.connecting = true;

		const options: kafkaTypes.ProducerGlobalConfig = {
			"metadata.broker.list": this.endpoints.kafka.join(","),
			"socket.keepalive.enable": true,
			"socket.nagle.disable": true,
			"client.id": this.clientId,
			"enable.idempotence": this.producerOptions.enableIdempotence,
			"queue.buffering.max.messages": 100000,
			"queue.buffering.max.ms": 0.5,
			"batch.num.messages": 10000,
			...this.producerOptions.additionalOptions,
		};

		this.producer = new kafka.HighLevelProducer(options, this.producerOptions.topicConfig);

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

		this.producer.setPollInterval(this.producerOptions.pollIntervalMs);
	}

	public async close(reconnecting: boolean = false): Promise<void> {
		if (this.closed) {
			return;
		}

		if (!reconnecting) {
			// when closed outside of this class, disable reconnecting
			this.closed = true;
		}

		this.connecting = this.connected = false;

		if (this.sendPending) {
			clearImmediate(this.sendPending);
			this.sendPending = undefined;
		}

		await new Promise<void>((resolve) => {
			const producer = this.producer;
			this.producer = undefined;
			if (producer && producer.isConnected()) {
				producer.disconnect(resolve);
			} else {
				resolve();
			}
		});

		if (this.closed) {
			this.emit("closed");
			this.removeAllListeners();
		}
	}

	/**
	 * Sends the provided message to Kafka
	 */
	// eslint-disable-next-line @typescript-eslint/ban-types,@typescript-eslint/promise-function-async
	public send(messages: object[], tenantId: string, documentId: string, partitionId?: number): Promise<any> {
		const key = `${tenantId}/${documentId}`;

		// the latest boxcar
		let boxcar: PendingBoxcar;

		// Get the list of boxcars for the given key
		let boxcars = this.messages.get(key);
		if (boxcars) {
			boxcar = boxcars[boxcars.length - 1];

			// Create a new boxcar if necessary
			if (boxcar.partitionId !== partitionId || boxcar.messages.length + messages.length >= MaxBatchSize) {
				boxcar = new PendingBoxcar(tenantId, documentId);
				boxcars.push(boxcar);
			}
		} else {
			boxcar = new PendingBoxcar(tenantId, documentId);
			boxcars = [boxcar];
			this.messages.set(key, boxcars);
		}

		// Add the message to the boxcar
		boxcar.messages.push(...messages);

		if (partitionId !== undefined) {
			// sending this boxcar to a specific partition
			boxcar.partitionId = partitionId;
		}

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
					boxcar.partitionId ?? null, // partition id or null for consistent random for keyed messages
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
		await this.close(true);

		this.emit("error", error);

		this.connect();
	}
}
