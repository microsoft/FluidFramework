/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as kafka from "node-rdkafka";

import { Deferred } from "@fluidframework/common-utils";
import { IConsumer, IPartition, IPartitionWithEpoch, IQueuedMessage } from "@fluidframework/server-services-core";
import { ZookeeperClient } from "./zookeeperClient";
import { IKafkaEndpoints, RdkafkaBase } from "./rdkafkaBase";

/**
 * Kafka consumer using the node-rdkafka library
 */
export class RdkafkaConsumer extends RdkafkaBase implements IConsumer {
	private consumer?: kafka.KafkaConsumer;
	private zooKeeperClient?: ZookeeperClient;

	private isRebalancing = true;
	private assignedPartitions: Set<number> = new Set();
	private readonly pendingCommits: Map<number, Deferred<void>> = new Map();

	constructor(
		endpoints: IKafkaEndpoints,
		clientId: string,
		topic: string,
		public readonly groupId: string,
		numberOfPartitions?: number,
		replicationFactor?: number) {
		super(endpoints, clientId, topic, numberOfPartitions, replicationFactor);
	}

	protected connect() {
		const zookeeperEndpoints = this.endpoints.zooKeeper;
		if (zookeeperEndpoints && zookeeperEndpoints.length > 0) {
			const zooKeeperEndpoint = zookeeperEndpoints[Math.floor(Math.random() % zookeeperEndpoints.length)];
			this.zooKeeperClient = new ZookeeperClient(zooKeeperEndpoint);
		}

		this.consumer = new kafka.KafkaConsumer(
			{
				"metadata.broker.list": this.endpoints.kafka.join(","),
				"socket.keepalive.enable": true,
				"socket.nagle.disable": true,
				"client.id": this.clientId,
				"group.id": this.groupId,
				"enable.auto.commit": false,
				"fetch.min.bytes": 1,
				"fetch.max.bytes": 1024 * 1024,
				"offset_commit_cb": true,
				"rebalance_cb": true,
			},
			{
				"auto.offset.reset": "latest",
			});

		this.consumer.on("ready", () => {
			this.consumer.subscribe([this.topic]);
			this.consumer.consume();

			this.emit("connected");
		});

		this.consumer.on("disconnected", () => {
			this.emit("disconnected");
		});

		this.consumer.on("connection.failure", (error) => {
			this.emit("error", error);
		});

		this.consumer.on("data", (message: kafka.Message) => {
			this.emit("data", message as IQueuedMessage);
		});

		this.consumer.on("offset.commit", (err, offsets) => {
			if (err) {
				this.emit("error", err);
			}

			for (const offset of offsets) {
				const deferredCommit = this.pendingCommits.get(offset.partition);
				if (deferredCommit) {
					this.pendingCommits.delete(offset.partition);

					if (err) {
						deferredCommit.reject(err);
					} else {
						deferredCommit.resolve();

						this.emit("checkpoint", offset.partition, offset.offset);
					}
				} else {
					this.emit("error", new Error(`Unknown commit for partition ${offset.partition}`));
				}
			}
		});

		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		this.consumer.on("rebalance", async (err, topicPartitions) => {
			if (err.code === kafka.CODES.ERRORS.ERR__ASSIGN_PARTITIONS ||
				err.code === kafka.CODES.ERRORS.ERR__REVOKE_PARTITIONS) {
				const newAssignedPartitions = new Set(topicPartitions.map((tp) => tp.partition));

				if (newAssignedPartitions.size === this.assignedPartitions.size &&
					Array.from(this.assignedPartitions).every((ap) => newAssignedPartitions.has(ap))) {
					// the consumer is already up to date
					return;
				}

				if (this.isRebalancing) {
					this.isRebalancing = false;
				} else {
					this.emit("rebalancing", this.getPartitions(this.assignedPartitions), err.code);
				}

				// maybe?
				// this.pendingCommits.clear();

				this.assignedPartitions = newAssignedPartitions;

				try {
					const partitions = this.getPartitions(this.assignedPartitions);
					const partitionsWithEpoch = await this.fetchPartitionEpochs(partitions);
					this.emit("rebalanced", partitionsWithEpoch, err.code);
				} catch (ex) {
					this.emit("error", ex);
				}
			} else {
				this.emit("error", err);
			}
		});

		this.consumer.on("rebalance.error", (error) => {
			this.emit("error", error);
		});

		this.consumer.on("event.error", (error) => {
			this.emit("error", error);
		});

		this.consumer.on("event.throttle", (event) => {
			this.emit("throttled", event);
		});

		this.consumer.connect();
	}

	public async close(): Promise<void> {
		await new Promise((resolve) => {
			if (this.consumer && this.consumer.isConnected()) {
				this.consumer.disconnect(resolve);
				this.consumer = undefined;
			} else {
				resolve();
			}
		});

		if (this.zooKeeperClient) {
			this.zooKeeperClient.close();
			this.zooKeeperClient = undefined;
		}

		this.isRebalancing = true;
		this.assignedPartitions.clear();
		this.pendingCommits.clear();
	}

	public async commitCheckpoint(partitionId: number, queuedMessage: IQueuedMessage): Promise<void> {
		if (!this.consumer) {
			throw new Error("Invalid consumer");
		}

		if (this.pendingCommits.has(partitionId)) {
			throw new Error(`There is already a pending commit for partition ${partitionId}`);
		}

		// this will be resolved in the "offset.commit" event
		const deferredCommit = new Deferred<void>();
		this.pendingCommits.set(partitionId, deferredCommit);

		// logs are replayed from the last checkpointed offset.
		// to avoid reprocessing the last message twice, we checkpoint at offset + 1
		this.consumer.commit({
			topic: this.topic,
			partition: partitionId,
			offset: queuedMessage.offset + 1,
		});

		return deferredCommit.promise;
	}

	public async pause() {
		this.consumer?.unsubscribe();
		return Promise.resolve();
	}

	public async resume() {
		this.consumer?.subscribe([this.topic]);
		return Promise.resolve();
	}

	private getPartitions(partitions: Set<number>): IPartition[] {
		return Array.from(partitions).map((partition) => ({
			topic: this.topic,
			partition,
			offset: -1, // n/a
		}));
	}

	private async fetchPartitionEpochs(partitions: IPartition[]): Promise<IPartitionWithEpoch[]> {
		let epochs: number[];

		if (this.zooKeeperClient) {
			const epochsP = new Array<Promise<number>>();
			for (const partition of partitions) {
				epochsP.push(this.zooKeeperClient.getPartitionLeaderEpoch(this.topic, partition.partition));
			}

			epochs = await Promise.all(epochsP);
		} else {
			epochs = new Array(partitions.length).fill(0);
		}

		const partitionsWithEpoch: IPartitionWithEpoch[] = [];

		for (let i = 0; i < partitions.length; ++i) {
			const partitionWithEpoch = partitions[i] as IPartitionWithEpoch;
			partitionWithEpoch.leaderEpoch = epochs[i];
			partitionsWithEpoch.push(partitionWithEpoch);
		}

		return partitionsWithEpoch;
	}
}
