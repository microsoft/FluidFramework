/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type * as kafkaTypes from "node-rdkafka";

import { Deferred } from "@fluidframework/common-utils";
import {
	IConsumer,
	IPartition,
	IPartitionWithEpoch,
	IQueuedMessage,
	IZookeeperClient,
	ZookeeperClientConstructor,
} from "@fluidframework/server-services-core";
import { IKafkaBaseOptions, IKafkaEndpoints, RdkafkaBase } from "./rdkafkaBase";

export interface IKafkaConsumerOptions extends Partial<IKafkaBaseOptions> {
	consumeTimeout: number;
	consumeLoopTimeoutDelay: number;
	optimizedRebalance: boolean;
	commitRetryDelay: number;
	automaticConsume: boolean;
	maxConsumerCommitRetries: number;
	additionalOptions?: kafkaTypes.ConsumerGlobalConfig;
	zooKeeperClientConstructor?: ZookeeperClientConstructor;
}

/**
 * Kafka consumer using the node-rdkafka library
 */
export class RdkafkaConsumer extends RdkafkaBase implements IConsumer {
	private readonly consumerOptions: IKafkaConsumerOptions;
	private consumer?: kafkaTypes.KafkaConsumer;
	private zooKeeperClient?: IZookeeperClient;
	private closed = false;
	private isRebalancing = true;
	private assignedPartitions: Set<number> = new Set();
	private readonly pendingCommits: Map<number, Deferred<void>> = new Map();
	private readonly pendingMessages: Map<number, kafkaTypes.Message[]> = new Map();
	private readonly latestOffsets: Map<number, number> = new Map();

	constructor(
		endpoints: IKafkaEndpoints,
		clientId: string,
		topic: string,
		public readonly groupId: string,
		options?: Partial<IKafkaConsumerOptions>) {
		super(endpoints, clientId, topic, options);

		this.defaultRestartOnKafkaErrorCodes = [
			this.kafka.CODES.ERRORS.ERR__TRANSPORT,
			this.kafka.CODES.ERRORS.ERR__MSG_TIMED_OUT,
			this.kafka.CODES.ERRORS.ERR__ALL_BROKERS_DOWN,
			this.kafka.CODES.ERRORS.ERR__TIMED_OUT,
			this.kafka.CODES.ERRORS.ERR__SSL,
			this.kafka.CODES.ERRORS.ERR_COORDINATOR_LOAD_IN_PROGRESS,
		];

		this.consumerOptions = {
			...options,
			consumeTimeout: options?.consumeTimeout ?? 1000,
			consumeLoopTimeoutDelay: options?.consumeLoopTimeoutDelay ?? 100,
			optimizedRebalance: options?.optimizedRebalance ?? false,
			commitRetryDelay: options?.commitRetryDelay ?? 1000,
			automaticConsume: options?.automaticConsume ?? true,
			maxConsumerCommitRetries: options?.maxConsumerCommitRetries ?? 10,
		};
	}

	/**
	 * Returns true if the consumer is connected
	 */
	public isConnected() {
		return this.consumer?.isConnected() ? true : false;
	}

	/**
	 * Returns the offset of the latest consumsed message
	 */
	public getLatestMessageOffset(partitionId: number): number | undefined {
		return this.latestOffsets.get(partitionId);
	}

	protected connect() {
		if (this.closed) {
			return;
		}

		const zookeeperEndpoints = this.endpoints.zooKeeper;
		if (zookeeperEndpoints && zookeeperEndpoints.length > 0 && this.consumerOptions.zooKeeperClientConstructor) {
			const zooKeeperEndpoint = zookeeperEndpoints[Math.floor(Math.random() % zookeeperEndpoints.length)];
			this.zooKeeperClient = new this.consumerOptions.zooKeeperClientConstructor(zooKeeperEndpoint);
		}

		const options: kafkaTypes.ConsumerGlobalConfig = {
			"metadata.broker.list": this.endpoints.kafka.join(","),
			"socket.keepalive.enable": true,
			"socket.nagle.disable": true,
			"client.id": this.clientId,
			"group.id": this.groupId,
			"enable.auto.commit": false,
			"fetch.min.bytes": 1,
			"fetch.max.bytes": 1024 * 1024,
			"offset_commit_cb": true,
			"rebalance_cb": this.consumerOptions.optimizedRebalance ? this.rebalance.bind(this) : true,
			...this.consumerOptions.additionalOptions,
			...this.sslOptions,
		};

		const consumer: kafkaTypes.KafkaConsumer = this.consumer =
			new this.kafka.KafkaConsumer(options, { "auto.offset.reset": "latest" });

		consumer.setDefaultConsumeTimeout(this.consumerOptions.consumeTimeout);
		consumer.setDefaultConsumeLoopTimeoutDelay(this.consumerOptions.consumeLoopTimeoutDelay);

		consumer.on("ready", () => {
			consumer.subscribe([this.topic]);

			if (this.consumerOptions.automaticConsume) {
				// start the consume loop
				consumer.consume();
			}

			this.emit("connected", consumer);
		});

		consumer.on("disconnected", () => {
			this.emit("disconnected");
		});

		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		consumer.on("connection.failure", async (error) => {
			await this.close(true);

			this.error(error);

			this.connect();
		});

		consumer.on("data", this.processMessage.bind(this));

		consumer.on("offset.commit", (err, offsets) => {
			let shouldRetryCommit = false;

			if (err) {
				// a rebalance occurred while we were committing
				// we can resubmit the commit if we still own the partition
				shouldRetryCommit =
					this.consumerOptions.optimizedRebalance &&
					(err.code === this.kafka.CODES.ERRORS.ERR_REBALANCE_IN_PROGRESS ||
						err.code === this.kafka.CODES.ERRORS.ERR_ILLEGAL_GENERATION);

				if (!shouldRetryCommit) {
					this.error(err);
				}
			}

			for (const offset of offsets) {
				const deferredCommit = this.pendingCommits.get(offset.partition);
				if (deferredCommit) {
					if (shouldRetryCommit) {
						setTimeout(() => {
							if (this.assignedPartitions.has(offset.partition)) {
								// we still own this partition. checkpoint again
								this.consumer?.commit(offset);
							}
						}, this.consumerOptions.commitRetryDelay);
						continue;
					}

					this.pendingCommits.delete(offset.partition);

					if (err) {
						deferredCommit.reject(err);
					} else {
						deferredCommit.resolve();

						this.emit("checkpoint", offset.partition, offset.offset);
					}
				} else {
					this.error(new Error(`Unknown commit for partition ${offset.partition}`));
				}
			}
		});

		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		consumer.on("rebalance", async (err, topicPartitions) => {
			if (err.code === this.kafka.CODES.ERRORS.ERR__ASSIGN_PARTITIONS ||
				err.code === this.kafka.CODES.ERRORS.ERR__REVOKE_PARTITIONS) {
				const newAssignedPartitions = new Set<number>(topicPartitions.map((tp) => tp.partition));

				if (newAssignedPartitions.size === this.assignedPartitions.size &&
					Array.from(this.assignedPartitions).every((ap) => newAssignedPartitions.has(ap))) {
					// the consumer is already up to date
					return;
				}

				// clear pending messages
				this.pendingMessages.clear();

				if (!this.consumerOptions.optimizedRebalance) {
					if (this.isRebalancing) {
						this.isRebalancing = false;
					} else {
						this.emit("rebalancing", this.getPartitions(this.assignedPartitions), err.code);
					}
				}

				const originalAssignedPartitions = this.assignedPartitions;
				this.assignedPartitions = newAssignedPartitions;

				try {
					this.isRebalancing = true;
					const partitions = this.getPartitions(this.assignedPartitions);
					const partitionsWithEpoch = await this.fetchPartitionEpochs(partitions);
					this.emit("rebalanced", partitionsWithEpoch, err.code);

					// cleanup things left over from the lost partitions
					for (const partition of originalAssignedPartitions) {
						if (!newAssignedPartitions.has(partition)) {
							// clear latest offset
							this.latestOffsets.delete(partition);

							// reject pending commit
							const deferredCommit = this.pendingCommits.get(partition);
							if (deferredCommit) {
								this.pendingCommits.delete(partition);
								deferredCommit.reject(new Error(`Partition for commit was unassigned. ${partition}`));
							}
						}
					}

					this.isRebalancing = false;

					for (const pendingMessages of this.pendingMessages.values()) {
						// process messages sent while we were rebalancing for each partition in order
						for (const pendingMessage of pendingMessages) {
							this.processMessage(pendingMessage);
						}
					}
				} catch (ex) {
					this.isRebalancing = false;
					this.error(ex);
				} finally {
					this.pendingMessages.clear();
				}
			} else {
				this.error(err);
			}
		});

		consumer.on("rebalance.error", (error) => {
			this.error(error);
		});

		consumer.on("event.error", (error) => {
			this.error(error);
		});

		consumer.on("event.throttle", (event) => {
			this.emit("throttled", event);
		});

		consumer.connect();
	}

	public async close(reconnecting: boolean = false): Promise<void> {
		if (this.closed) {
			return;
		}

		if (!reconnecting) {
			// when closed outside of this class, disable reconnecting
			this.closed = true;
		}

		await new Promise<void>((resolve) => {
			// eslint-disable-next-line @typescript-eslint/prefer-optional-chain
			if (this.consumer && this.consumer.isConnected()) {
				this.consumer.disconnect(resolve);
			} else {
				resolve();
			}
		});
		this.consumer = undefined;

		if (this.zooKeeperClient) {
			this.zooKeeperClient.close();
			this.zooKeeperClient = undefined;
		}

		this.assignedPartitions.clear();
		this.pendingCommits.clear();
		this.latestOffsets.clear();

		if (this.closed) {
			this.emit("closed");
			this.removeAllListeners();
		}
	}

	public async commitCheckpoint(
		partitionId: number,
		queuedMessage: IQueuedMessage,
		retries: number = 0): Promise<void> {
		const startTime = Date.now();
		try {
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

			const result = await deferredCommit.promise;
			const latency = Date.now() - startTime;
			this.emit("checkpoint_success", partitionId, queuedMessage, retries, latency);
			return result;
		} catch (ex) {
			const hasPartition = this.assignedPartitions.has(partitionId);
			const willRetry = this.consumer?.isConnected()
				&& retries < this.consumerOptions.maxConsumerCommitRetries
				&& hasPartition;

			const latency = Date.now() - startTime;
			this.emit("checkpoint_error", partitionId, queuedMessage, retries, latency, willRetry, ex);

			if (willRetry) {
				return this.commitCheckpoint(partitionId, queuedMessage, retries + 1);
			}

			throw ex;
		}
	}

	public async pause() {
		this.consumer?.unsubscribe();
		this.emit("paused");
		return Promise.resolve();
	}

	public async resume() {
		this.consumer?.subscribe([this.topic]);
		this.emit("resumed");
		return Promise.resolve();
	}

	/**
	 * Saves the latest offset for the partition and emits the data event with the message.
	 * If we are in the middle of rebalancing and the message was sent for a partition we will own,
	 * the message will be saved and processed after rebalancing is completed.
	 * @param message - The message
	 */
	private processMessage(message: kafkaTypes.Message) {
		const partition = message.partition;

		if (!this.assignedPartitions.has(partition)) {
			/*
				It is possible for node-rdkafka to send us messages for old partitions after a rebalance is processed.
				I assume it's due to some librdkafka logic related incoming message queueing.
				If we try to process this message:
				1. The emit "data" event will cause "Received message for untracked partition" to be thrown.
				2. A "latestOffset" will be set for this untracked partition.
				#1 is fine.. but #2 is a huge problem.
				If the consumer has a latestOffset for an unassigned partition and at some point later, is then
				assigned that partition, the consumer will start processing messages from that offset.
				This would result in a gap of missed messages!
				It needs to start from the latest committed kafka offset in this case.
			*/

			return;
		}

		if (this.isRebalancing) {
			/*
				It is possible to receive messages while we have not yet finished rebalancing
				due to how we wait for the fetchPartitionEpochs call to finish before emitting the rebalanced event.
				This means that the PartitionManager has not yet created the partition,
				so messages will be lost since they were sent to an "untracked partition".
				To fix this, we should temporarily store the messages and emit them once we finish rebalancing.
			*/

			let pendingMessages = this.pendingMessages.get(partition);

			if (!pendingMessages) {
				pendingMessages = [];
				this.pendingMessages.set(partition, pendingMessages);
			}

			pendingMessages.push(message);

			return;
		}

		this.latestOffsets.set(partition, message.offset);
		this.emit("data", message as IQueuedMessage);
	}

	private getPartitions(partitions: Set<number>): IPartition[] {
		return Array.from(partitions).map((partition) => ({
			topic: this.topic,
			partition,
			offset: -1, // n/a
		}));
	}

	/**
	 * The default node-rdkafka consumer rebalance callback with the addition
	 * of continuing from the last seen offset for assignments that have not changed
	 */
	private rebalance(err: kafkaTypes.LibrdKafkaError, assignments: kafkaTypes.Assignment[]) {
		if (!this.consumer) {
			return;
		}

		try {
			if (err.code === this.kafka.CODES.ERRORS.ERR__ASSIGN_PARTITIONS) {
				for (const assignment of assignments) {
					const offset = this.latestOffsets.get(assignment.partition);
					if (offset !== undefined) {
						// this consumer is already assigned this partition
						// ensure we continue reading from our current offset
						// + 1 so we do not read the latest message again
						(assignment as kafkaTypes.TopicPartitionOffset).offset = offset + 1;
					}
				}

				this.consumer.assign(assignments);
			} else if (err.code === this.kafka.CODES.ERRORS.ERR__REVOKE_PARTITIONS) {
				this.consumer.unassign();
			}
		} catch (ex) {
			if (this.consumer.isConnected()) {
				this.consumer.emit("rebalance.error", ex);
			}
		}
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
