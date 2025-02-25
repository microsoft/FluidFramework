/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import events_pkg from "events_pkg";
const { EventEmitter } = events_pkg;
import * as util from "util";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import {
	IConsumer,
	IPartition,
	IQueuedMessage,
	IZookeeperClient,
} from "@fluidframework/server-services-core";
import { ZookeeperClient } from "@fluidframework/server-services-ordering-zookeeper";
import * as kafka from "kafka-node";
import { ensureTopics } from "./kafkaTopics";

// time before reconnecting after an error occurs
const defaultReconnectDelay = 5000;

/**
 * Kafka consumer using the kafka-node library
 * @internal
 */
export class KafkaNodeConsumer implements IConsumer {
	private client!: kafka.KafkaClient;
	private consumerGroup!: kafka.ConsumerGroup;
	private readonly events = new EventEmitter();
	private readonly zookeeper?: IZookeeperClient;

	constructor(
		private readonly clientOptions: kafka.KafkaClientOptions,
		clientId: string,
		public readonly groupId: string,
		public readonly topic: string,
		zookeeperEndpoint?: string,
		private readonly topicPartitions?: number,
		private readonly topicReplicationFactor?: number,
		private readonly reconnectDelay: number = defaultReconnectDelay,
	) {
		clientOptions.clientId = clientId;
		this.connect().catch((err) => {
			Lumberjack.error("Error connecting to kafka", undefined, err);
		});
		if (zookeeperEndpoint) {
			this.zookeeper = new ZookeeperClient(zookeeperEndpoint);
		}
	}

	public isConnected() {
		return this.client ? true : false;
	}

	/**
	 * Returns the offset of the latest consumsed message
	 */
	public getLatestMessageOffset(partitionId: number): number | undefined {
		return undefined;
	}

	public async commitCheckpoint(
		partitionId: number,
		queuedMessage: IQueuedMessage,
	): Promise<void> {
		// Although tagged as optional, kafka-node requies a value in the metadata field.
		// Also logs are replayed from the last checkponited offset. To avoid reprocessing the last message
		// twice, we checkpoint at offset + 1.
		const commitRequest: kafka.OffsetCommitRequest[] = [
			{
				metadata: "m",
				offset: queuedMessage.offset + 1,
				partition: partitionId,
				topic: this.topic,
			},
		];

		return new Promise<void>((resolve, reject) => {
			this.consumerGroup.sendOffsetCommitRequest(commitRequest, (err, data) => {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}

	public async close(): Promise<void> {
		await util.promisify(((callback) => this.consumerGroup.close(false, callback)) as any)();
		await util.promisify(((callback) => this.client.close(callback)) as any)();
		if (this.zookeeper) {
			this.zookeeper.close();
		}
	}

	public on(event: string, listener: (...args: any[]) => void): this {
		this.events.on(event, listener);
		return this;
	}

	public once(event: string, listener: (...args: any[]) => void): this {
		this.events.once(event, listener);
		return this;
	}

	public async pause() {
		this.consumerGroup.pause();
	}

	public async resume() {
		this.consumerGroup.resume();
	}

	private async connect() {
		this.client = new kafka.KafkaClient(this.clientOptions);
		const groupId = this.groupId;

		try {
			await ensureTopics(
				this.client,
				[this.topic],
				this.topicPartitions,
				this.topicReplicationFactor,
			);
		} catch (error) {
			// Close the client if it exists
			if (this.client) {
				this.client.close();
				// This gets reassigned immediately in `this.connect()`
				this.client = undefined as unknown as kafka.KafkaClient;
			}

			this.events.emit("error", error);

			setTimeout(() => {
				this.connect().catch((err) => {
					Lumberjack.error("Error retrying connecting to kafka", undefined, err);
				});
			}, this.reconnectDelay);

			return;
		}

		this.consumerGroup = new kafka.ConsumerGroup(
			{
				kafkaHost: this.clientOptions.kafkaHost,
				ssl: this.clientOptions.sslOptions,
				sslOptions: this.clientOptions.sslOptions,
				id: this.clientOptions.clientId,
				autoCommit: false,
				fetchMaxBytes: 1024 * 1024,
				fetchMinBytes: 1,
				fromOffset: "latest",
				groupId,
				maxTickMessages: 100000,
			},
			[this.topic],
		);

		this.consumerGroup.on("connect", () => {
			this.events.emit("connected");
		});

		this.consumerGroup.on("rebalancing", () => {
			const payloads = (this.consumerGroup as any).topicPayloads;
			this.events.emit("rebalancing", this.getPartitions(payloads));
		});

		this.consumerGroup.on("rebalanced", async () => {
			const payloads = (this.consumerGroup as any).topicPayloads;
			const partitions = this.getPartitions(payloads);

			this.events.emit("rebalanced", partitions);
		});

		this.consumerGroup.on("message", (message: any) => {
			this.events.emit("data", message);
		});

		this.consumerGroup.on("error", (error) => {
			this.events.emit("error", error);
		});

		this.consumerGroup.on("offsetOutOfRange", (error) => {
			this.events.emit("error", error);
		});
	}

	private getPartitions(rawPartitions: any[]): IPartition[] {
		return rawPartitions.map((partition) => ({
			offset: parseInt(partition.offset, 10),
			partition: parseInt(partition.partition, 10),
			topic: partition.topic,
		}));
	}
}
