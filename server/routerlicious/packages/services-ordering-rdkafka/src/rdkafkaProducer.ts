/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type * as kafkaTypes from "node-rdkafka";
import {
	BoxcarType,
	IBoxcarMessage,
	IPendingBoxcar,
	IProducer,
	PendingBoxcar,
	MaxBatchSize,
	IContextErrorData,
} from "@fluidframework/server-services-core";
import { NetworkError } from "@fluidframework/server-services-client";
import { Deferred } from "@fluidframework/common-utils";

import { IKafkaBaseOptions, IKafkaEndpoints, RdkafkaBase } from "./rdkafkaBase";

export interface IKafkaProducerOptions extends Partial<IKafkaBaseOptions> {
	enableIdempotence: boolean;
	pollIntervalMs: number;
	maxBatchSize: number;
	maxMessageSize: number;
	additionalOptions?: kafkaTypes.ProducerGlobalConfig;
	topicConfig?: kafkaTypes.ProducerTopicConfig;
}

/**
 * Kafka producer using the node-rdkafka library
 */
export class RdkafkaProducer extends RdkafkaBase implements IProducer {
	private readonly producerOptions: IKafkaProducerOptions;
	private readonly messages = new Map<string, IPendingBoxcar[]>();

	/**
	 * Boxcar promises that have been queued into rdkafka and we are waiting for a response
	 */
	private readonly inflightPromises: Set<Deferred<void>> = new Set();

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

		this.defaultRestartOnKafkaErrorCodes = [
			this.kafka.CODES.ERRORS.ERR__TRANSPORT,
			this.kafka.CODES.ERRORS.ERR__UNKNOWN_PARTITION,
			this.kafka.CODES.ERRORS.ERR__ALL_BROKERS_DOWN,
			this.kafka.CODES.ERRORS.ERR__SSL,
			this.kafka.CODES.ERRORS.ERR_UNKNOWN_TOPIC_OR_PART,
			this.kafka.CODES.ERRORS.ERR_UNKNOWN_MEMBER_ID,
		];

		this.producerOptions = {
			...options,
			enableIdempotence: options?.enableIdempotence ?? false,
			pollIntervalMs: options?.pollIntervalMs ?? 10,
			maxBatchSize: options?.maxBatchSize ?? MaxBatchSize,
			maxMessageSize: options?.maxMessageSize ?? Number.MAX_SAFE_INTEGER,
		};
	}

	/**
	 * Returns true if the producer is connected
	 */
	public isConnected() {
		return this.connected;
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
			...this.sslOptions,
		};

		const producer: kafkaTypes.Producer = this.producer =
			new this.kafka.HighLevelProducer(options, this.producerOptions.topicConfig);

		producer.on("ready", () => {
			this.connected = true;
			this.connecting = false;

			this.emit("connected");

			this.sendPendingMessages();
		});

		producer.on("disconnected", () => {
			this.connected = false;
			this.connecting = false;

			this.emit("disconnected");
		});

		producer.on("connection.failure", (error) => {
			// eslint-disable-next-line @typescript-eslint/no-floating-promises
			this.handleError(error);
		});

		producer.on("event.error", (error) => {
			// eslint-disable-next-line @typescript-eslint/no-floating-promises
			this.handleError(error);
		});

		producer.on("event.throttle", (event) => {
			this.emit("throttled", event);
		});

		producer.connect();

		producer.setPollInterval(this.producerOptions.pollIntervalMs);
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

		// reject any messages that are currently inflight
		for (const promise of this.inflightPromises) {
			promise.reject(new Error("Closed RdkafkaProducer"));
		}

		this.inflightPromises.clear();

		await new Promise<void>((resolve) => {
			const producer = this.producer;
			this.producer = undefined;
			// eslint-disable-next-line @typescript-eslint/prefer-optional-chain
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
			if (boxcar.partitionId !== partitionId ||
				boxcar.messages.length + messages.length >= this.producerOptions.maxBatchSize) {
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
		if (this.connected && boxcar.messages.length >= this.producerOptions.maxBatchSize) {
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
		const messages = Array.from(this.messages.values());

		// clear messages now because sendBoxcars may insert some
		this.messages.clear();

		for (const message of messages) {
			this.sendBoxcars(message);
		}
	}

	private sendBoxcars(boxcars: IPendingBoxcar[]) {
		for (const boxcar of boxcars) {
			const boxcarMessage: IBoxcarMessage = {
				contents: boxcar.messages,
				documentId: boxcar.documentId,
				tenantId: boxcar.tenantId,
				type: BoxcarType,
			};

			const message = Buffer.from(JSON.stringify(boxcarMessage));
			if (message.byteLength > this.producerOptions.maxMessageSize) {
				const error = new NetworkError(
					413,
					// eslint-disable-next-line max-len
					`Boxcar message size (${message.byteLength}) exceeded max message size (${this.producerOptions.maxMessageSize})`,
				);
				boxcar.deferred.reject(error);
				continue;
			}

			try {
				if (this.producer && this.connected) {
					this.inflightPromises.add(boxcar.deferred);

					this.producer.produce(
						this.topic, // topic
						boxcar.partitionId ?? null, // partition id or null for consistent random for keyed messages
						message, // message
						boxcar.documentId, // key
						undefined, // timestamp
						(err: any, offset?: number) => {
							this.inflightPromises.delete(boxcar.deferred);

							if (err) {
								boxcar.deferred.reject(err);

								// eslint-disable-next-line @typescript-eslint/no-floating-promises
								this.handleError(err, {
									restart: true,
									tenantId: boxcar.tenantId,
									documentId: boxcar.documentId,
								});
							} else {
								boxcar.deferred.resolve();
								this.emit("produced", boxcarMessage, offset, message.length);
							}
						},
					);
				} else {
					// we don't have a producer or we are not connected.
					// normally sendBoxcars would not be called in this scenario, but it could happen if
					// the above this.producer.produce call errors out and calls this.handleError within this for loop.
					// when this happens, let's requeue the messages for later.
					// note: send will return a new deferred. we need to hook it into
					// the existing boxcar deferred to ensure continuity
					/* eslint-disable @typescript-eslint/unbound-method */
					this.send(boxcar.messages, boxcar.tenantId, boxcar.documentId, boxcar.partitionId)
						.then(boxcar.deferred.resolve)
						.catch(boxcar.deferred.reject);
					/* eslint-enable @typescript-eslint/unbound-method */
				}
			} catch (ex) {
				// produce can throw if the outgoing message queue is full
				boxcar.deferred.reject(ex);

				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				this.handleError(ex, {
					restart: true,
					tenantId: boxcar.tenantId,
					documentId: boxcar.documentId,
				});
			}
		}
	}

	/**
	 * Handles an error that requires a reconnect to Kafka
	 */
	private async handleError(error: any, errorData?: IContextErrorData) {
		await this.close(true);

		this.error(error, errorData);

		this.connect();
	}
}
