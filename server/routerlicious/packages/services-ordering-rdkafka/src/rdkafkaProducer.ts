/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type * as kafkaTypes from "node-rdkafka";
import { Deferred } from "@fluidframework/server-common-utils";
import {
	BoxcarType,
	IBoxcarMessage,
	IPendingBoxcar,
	IProducer,
	PendingBoxcar,
	IContextErrorData,
} from "@fluidframework/server-services-core";
import { NetworkError } from "@fluidframework/server-services-client";
import { Lumberjack, getLumberBaseProperties } from "@fluidframework/server-services-telemetry";

import { IKafkaBaseOptions, IKafkaEndpoints, RdkafkaBase } from "./rdkafkaBase";

/**
 * Rdkafka producer options
 * @internal
 */
export interface IKafkaProducerOptions extends Partial<IKafkaBaseOptions> {
	/**
	 * Determines if the producer should be closed and reopened when a fatal error occurs.
	 * Defaults to false because most errors are recoverable (it won't break the existing producer).
	 */
	reconnectOnNonFatalErrors: boolean;

	/**
	 * See https://github.com/edenhill/librdkafka/blob/master/INTRODUCTION.md#idempotent-producer
	 */
	enableIdempotence: boolean;

	/**
	 * See https://github.com/edenhill/librdkafka/blob/master/CONFIGURATION.md
	 */
	additionalOptions?: kafkaTypes.ProducerGlobalConfig;

	/**
	 * See https://github.com/edenhill/librdkafka/blob/master/CONFIGURATION.md
	 */
	topicConfig?: kafkaTypes.ProducerTopicConfig;

	pollIntervalMs: number;
	maxMessageSize: number;
}

/**
 * Kafka producer using the node-rdkafka library
 * @internal
 */
export class RdkafkaProducer extends RdkafkaBase implements IProducer {
	private readonly producerOptions: IKafkaProducerOptions;

	/**
	 * Messages queued up to be sent once the producer connects
	 */
	private pendingMessages: IPendingBoxcar[] = [];

	/**
	 * Boxcar promises that have been queued into rdkafka and we are waiting for a response
	 */
	private readonly inflightPromises: Set<Deferred<void>> = new Set();

	private connectedProducer?: kafkaTypes.Producer;
	private connectingProducer?: kafkaTypes.Producer;

	private sendPending?: NodeJS.Immediate;
	private closed = false;

	constructor(
		endpoints: IKafkaEndpoints,
		clientId: string,
		topic: string,
		options?: Partial<IKafkaProducerOptions>,
	) {
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
			reconnectOnNonFatalErrors: options?.reconnectOnNonFatalErrors ?? false,
			enableIdempotence: options?.enableIdempotence ?? false,
			pollIntervalMs: options?.pollIntervalMs ?? 10,
			maxMessageSize: options?.maxMessageSize ?? Number.MAX_SAFE_INTEGER,
		};
	}

	/**
	 * Returns true if the producer is connected
	 */
	public isConnected() {
		return this.connectedProducer !== undefined;
	}

	/**
	 * Creates a connection to Kafka. Will reconnect on failure.
	 */
	protected async connect() {
		// Exit out if we are already connected, are in the process of connecting, or closed
		if (this.connectedProducer || this.connectingProducer || this.closed) {
			return;
		}

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

		const producer: kafkaTypes.Producer = (this.connectingProducer =
			new this.kafka.HighLevelProducer(options, this.producerOptions.topicConfig));

		producer.on("ready", () => {
			this.connectedProducer = producer;
			this.connectingProducer = undefined;

			this.emit("connected", producer);

			// send pending messages
			this.requestSend();
		});

		producer.on("disconnected", () => {
			if (this.connectedProducer === producer || this.connectingProducer === producer) {
				this.emit("disconnected");
			}
		});

		/**
		 * connection.failure is emitted if the initial connection fails.
		 * we must try closing & reconnecting in that case
		 */
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		producer.on("connection.failure", async (error) => {
			try {
				await this.close(true);
				this.error(error, {
					restart: false,
					errorLabel: "rdkafkaProducer:connection.failure",
				});
				await this.connect();
			} catch (err) {
				Lumberjack.error(
					"Error encountered when handling producer connection.failure",
					undefined,
					err,
				);
			}
		});

		producer.on("event.error", (error) => {
			this.handleError(producer, error, {
				restart: false,
				errorLabel: "rdkafkaProducer:event.error",
			}).catch((handleErrorError) => {
				Lumberjack.error(
					"Error encountered when handling producer event.error",
					undefined,
					handleErrorError,
				);
			});
		});

		producer.on("event.throttle", (event) => {
			this.emit("throttled", event);
		});

		producer.on("event.log", (event) => {
			this.emit("log", event);
			Lumberjack.info(`RdKafka producer: ${event.message}`);
		});

		await this.setOauthBearerTokenIfNeeded(producer);
		producer.connect();

		producer.setPollInterval(this.producerOptions.pollIntervalMs);
	}

	/**
	 * Closes the producer and rejects any inflight messages
	 * @param reconnecting - Flag to set if the producer will reconnect after closing
	 */
	public async close(reconnecting: boolean = false): Promise<void> {
		if (this.closed) {
			return;
		}

		if (!reconnecting) {
			// when closed outside of this class, disable reconnecting
			this.closed = true;
		}

		if (this.sendPending !== undefined) {
			clearImmediate(this.sendPending);
			this.sendPending = undefined;
		}

		// ensure producers are disconnected
		// note: setting them to undefined before rejecting inflight promises because
		// we need to ensure a subsequent send in the rejection handling will queue instead of trying to send again
		const connectedProducer = this.connectedProducer;
		const connectingProducer = this.connectingProducer;
		this.connectedProducer = undefined;
		this.connectingProducer = undefined;

		// reject any messages that are currently inflight
		for (const promise of this.inflightPromises) {
			promise.reject(new Error("Closed RdkafkaProducer"));
		}

		this.inflightPromises.clear();

		await Promise.all([
			new Promise<void>((resolve) => {
				if (connectedProducer?.isConnected()) {
					connectedProducer.disconnect(resolve);
				} else {
					resolve();
				}
			}),
			new Promise<void>((resolve) => {
				if (connectingProducer?.isConnected()) {
					connectingProducer.disconnect(resolve);
				} else {
					resolve();
				}
			}),
		]);

		if (this.closed) {
			this.emit("closed");
			this.removeAllListeners();
		}
	}

	/**
	 * Sends the provided message to Kafka
	 */
	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public send(
		messages: object[],
		tenantId: string,
		documentId: string,
		partitionId?: number,
	): Promise<any> {
		// createa boxcar for these messages
		const boxcar = new PendingBoxcar(tenantId, documentId);
		boxcar.messages = messages;

		if (partitionId !== undefined) {
			// sending this boxcar to a specific partition
			boxcar.partitionId = partitionId;
		}

		// Send immediately if we are connected we are connected, otherwise request a send
		if (this.connectedProducer) {
			this.sendBoxcar(boxcar);
		} else {
			this.pendingMessages.push(boxcar);

			this.requestSend();
		}

		return boxcar.deferred.promise;
	}

	/**
	 * Notifies of the need to send pending messages
	 */
	private requestSend() {
		// If we aren't connected yet defer sending until connected
		if (!this.connectedProducer) {
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
		const messages = this.pendingMessages;

		// clear messages now because sendBoxcars may insert some
		this.pendingMessages = [];

		for (const message of messages) {
			this.sendBoxcar(message);
		}
	}

	/**
	 * Produce the boxcars to Kafka
	 */
	private sendBoxcar(boxcar: IPendingBoxcar): void {
		const lumberjackProperties = {
			...getLumberBaseProperties(boxcar.documentId, boxcar.tenantId),
		};
		const boxcarMessage: IBoxcarMessage = {
			contents: boxcar.messages,
			documentId: boxcar.documentId,
			tenantId: boxcar.tenantId,
			type: BoxcarType,
		};

		const message = Buffer.from(JSON.stringify(boxcarMessage));
		if (message.byteLength > this.producerOptions.maxMessageSize) {
			const error = this.createMessageSizeTooLargeError(boxcar, message);
			boxcar.deferred.reject(error);
			return;
		}

		const producer = this.connectedProducer;
		if (!producer) {
			// we don't have a producer or we are not connected.
			// normally sendBoxcars would not be called in this scenario, but it could happen if
			// a previous this.producer.produce call errored out and calls this.handleError.
			// when this happens, let's requeue the messages for later.
			// note: send will return a new deferred. we need to hook it into
			// the existing boxcar deferred to ensure continuity
			/* eslint-disable @typescript-eslint/unbound-method */
			this.send(boxcar.messages, boxcar.tenantId, boxcar.documentId, boxcar.partitionId)
				.then(boxcar.deferred.resolve)
				.catch(boxcar.deferred.reject);
			/* eslint-enable @typescript-eslint/unbound-method */
			return;
		}

		try {
			// mark that this message is "inflight" (we are in the process of producing it)
			this.inflightPromises.add(boxcar.deferred);

			producer.produce(
				this.topic, // topic
				boxcar.partitionId ?? null, // partition id or null for consistent random for keyed messages
				message, // message
				boxcar.documentId, // key
				Date.now(), // timestamp
				(ex: any, offset?: number) => {
					this.inflightPromises.delete(boxcar.deferred);

					let err = ex;
					if (err) {
						// ensure that "message size too large" errors are thrown as network errors
						if (this.isMessageSizeTooLargeError(err)) {
							err = this.createMessageSizeTooLargeError(boxcar, message);
						}

						boxcar.deferred.reject(err);

						this.handleError(producer, err, {
							restart: true,
							tenantId: boxcar.tenantId,
							documentId: boxcar.documentId,
							errorLabel: "rdkafkaProducer:producer.produce",
						}).catch((error) => {
							Lumberjack.error(
								"Error encountered when handling producer error in sendBoxcar()",
								{ ...lumberjackProperties },
								error,
							);
						});
					} else {
						boxcar.deferred.resolve();
						this.emit(
							"produced",
							boxcarMessage,
							offset,
							message.length,
							boxcar.partitionId,
						);
					}
				},
			);
		} catch (ex) {
			let err = ex;

			// ensure that "message size too large" errors are thrown as network errors
			if (this.isMessageSizeTooLargeError(err)) {
				err = this.createMessageSizeTooLargeError(boxcar, message);
			}

			// produce can throw if the outgoing message queue is full
			boxcar.deferred.reject(err);

			this.handleError(producer, err, {
				restart: true,
				tenantId: boxcar.tenantId,
				documentId: boxcar.documentId,
				errorLabel: "rdkafkaProducer:sendBoxcar",
			}).catch((error) => {
				Lumberjack.error(
					"Error encountered when handling producer error in sendBoxcar() catch block",
					{ ...lumberjackProperties },
					error,
				);
			});
		}
	}

	/**
	 * Handles an producer error.
	 * It may cause a reconnection is the producer that had the error
	 * is currently 'valid' (being tracked as connecting or connected).
	 */
	private async handleError(
		producer: kafkaTypes.Producer,
		error: any,
		errorData?: IContextErrorData,
	) {
		this.error(error, errorData);

		if (!this.producerOptions.reconnectOnNonFatalErrors) {
			// we should not reconnect on non fatal errors
			const isFatalError =
				RdkafkaBase.isObject(error) &&
				(error as kafkaTypes.LibrdKafkaError).code === this.kafka.CODES.ERRORS.ERR__FATAL;
			if (!isFatalError) {
				// it's not fatal!
				return;
			}
		}

		if (this.connectingProducer && this.connectingProducer !== producer) {
			// a producer is currently connecting and this error is not related to it
			return;
		}

		if (this.connectedProducer && this.connectedProducer !== producer) {
			// a producer is currently connected and this error is not related to it
			return;
		}

		await this.close(true);

		await this.connect();
	}

	/**
	 * Check if an exception is a "Broker: Message size too large" error
	 */
	private isMessageSizeTooLargeError(ex: any): boolean {
		return (
			RdkafkaBase.isObject(ex) &&
			((ex as kafkaTypes.LibrdKafkaError).code ===
				this.kafka.CODES.ERRORS.ERR_MSG_SIZE_TOO_LARGE ||
				(ex as Error).message.toLowerCase().includes("message size too large"))
		);
	}

	/**
	 * Creates a standard code 413 "Message size too large" NetworkError
	 */
	private createMessageSizeTooLargeError(boxcar: IPendingBoxcar, message: Buffer) {
		return new NetworkError(
			413,
			`Message size too large. Boxcar message count: ${boxcar.messages.length}, size: ${message.byteLength}, max message size: ${this.producerOptions.maxMessageSize}.`,
		);
	}
}
