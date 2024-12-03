/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
	IConsumer,
	IQueuedMessage,
	IPartition,
	IPartitionLambdaFactory,
	ILogger,
	LambdaCloseType,
	IContextErrorData,
} from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { Provider } from "nconf";
import { Partition } from "./partition";

/**
 * The PartitionManager is responsible for maintaining a list of partitions for the given Kafka topic.
 * It will route incoming messages to the appropriate partition for the messages.
 * @internal
 */
export class PartitionManager extends EventEmitter {
	private readonly partitions = new Map<number, Partition>();
	// Start rebalancing until we receive the first rebalanced message
	private isRebalancing = true;

	private stopped = false;

	constructor(
		private readonly factory: IPartitionLambdaFactory,
		private readonly consumer: IConsumer,
		private readonly logger?: ILogger,
		private readonly config?: Provider,
		listenForConsumerErrors = true,
	) {
		super();

		// Place new Kafka messages into our processing queue
		this.consumer.on("data", (message) => {
			this.process(message);
		});

		this.consumer.on("rebalancing", (partitions) => {
			this.rebalancing(partitions);
		});

		this.consumer.on("rebalanced", (partitions: IPartition[]) => {
			this.rebalanced(partitions);
		});

		if (listenForConsumerErrors) {
			this.consumer.on("error", (error, errorData: IContextErrorData) => {
				if (this.stopped) {
					Lumberjack.info(
						"Consumer.onError: PartitionManager already stopped, not emitting error again",
						{ error, ...errorData },
					);
					return;
				}

				this.emit("error", error, errorData);
			});

			this.consumer.on(
				"checkpoint_success",
				(partitionId, queuedMessage, retries, latency) => {
					if (this.sampleMessages(100)) {
						Lumberjack.info(`Kafka checkpoint successful`, {
							msgOffset: queuedMessage.offset,
							topic: queuedMessage.topic,
							msgPartition: queuedMessage.partition,
							retries,
							latency,
						});
					}
				},
			);

			this.consumer.on(
				"checkpoint_error",
				(partitionId, queuedMessage, retries, latency, ex) => {
					Lumberjack.error(
						`Kafka checkpoint failed`,
						{
							msgOffset: queuedMessage.offset,
							topic: queuedMessage.topic,
							msgPartition: queuedMessage.partition,
							retries,
							latency,
						},
						ex,
					);
				},
			);
		}
	}

	public async stop(): Promise<void> {
		this.stopped = true;

		this.logger?.info("Stop requested");
		Lumberjack.info("Stop requested");

		// Drain all pending messages from the partitions
		const partitionsStoppedP: Promise<void>[] = [];
		for (const [, partition] of this.partitions) {
			const stopP = partition.drain();
			partitionsStoppedP.push(stopP);
		}
		await Promise.all(partitionsStoppedP);

		// Then stop them all
		for (const [, partition] of this.partitions) {
			partition.close(LambdaCloseType.Stop);
		}

		this.partitions.clear();

		this.removeAllListeners();
	}

	public pause(partitionId: number, offset: number): void {
		const partition = this.partitions.get(partitionId);
		if (partition) {
			partition.pause(offset);
		} else {
			throw new Error(`PartitionId ${partitionId} not found for pause`);
		}
	}

	public resume(partitionId: number): void {
		const partition = this.partitions.get(partitionId);
		if (partition) {
			partition.resume();
		} else {
			throw new Error(`PartitionId ${partitionId} not found for resume`);
		}
	}

	private process(message: IQueuedMessage) {
		if (this.stopped) {
			return;
		}

		if (this.isRebalancing) {
			this.logger?.info(
				`Ignoring ${message.topic}:${message.partition}@${message.offset} due to pending rebalance`,
			);
			Lumberjack.info(
				`Ignoring ${message.topic}:${message.partition}@${message.offset} due to pending rebalance`,
			);
			return;
		}

		const partition = this.partitions.get(message.partition);
		if (!partition) {
			this.emit(
				"error",
				`Received message for untracked partition ${message.topic}:${message.partition}@${message.offset}`,
			);
			return;
		}

		partition.process(message);
	}

	/**
	 * Called when rebalancing starts
	 * Note: The consumer may decide to only emit "rebalanced" if it wants to skip closing existing partitions
	 * @param partitions - Assigned partitions before the rebalance
	 */
	private rebalancing(partitions: IPartition[]) {
		this.logger?.info(`Rebalancing partitions: ${JSON.stringify(partitions)}`);
		Lumberjack.info(`Rebalancing partitions: ${JSON.stringify(partitions)}`);

		this.isRebalancing = true;

		for (const [id, partition] of this.partitions) {
			this.logger?.info(`Closing partition ${id} due to rebalancing`);
			Lumberjack.info(`Closing partition ${id} due to rebalancing`);
			partition.close(LambdaCloseType.Rebalance);
		}

		this.partitions.clear();
	}

	/**
	 * Called when rebalanced occurs
	 * @param partitions - Assigned partitions after the rebalance.
	 * May contain partitions that have been previously assigned to this consumer
	 */
	private rebalanced(partitions: IPartition[]) {
		if (this.stopped) {
			return;
		}

		this.isRebalancing = false;

		const partitionsMap = new Map(
			partitions.map((partition) => [partition.partition, partition]),
		);

		// close and remove existing partitions that are no longer assigned
		const existingPartitions = Array.from(this.partitions);
		for (const [id, partition] of existingPartitions) {
			if (!partitionsMap.has(id)) {
				this.logger?.info(`Closing partition ${id} due to rebalancing`);
				Lumberjack.info(`Closing partition ${id} due to rebalancing`);
				partition.close(LambdaCloseType.Rebalance);
				this.partitions.delete(id);
			}
		}

		// create new partitions
		for (const partition of partitions) {
			if (this.partitions.has(partition.partition)) {
				// this partition already exists
				// it must have existed before the rebalance
				continue;
			}

			this.logger?.info(
				`Creating ${partition.topic}: Partition ${partition.partition}, Offset ${partition.offset} due to rebalance`,
			);
			Lumberjack.info(
				`Creating ${partition.topic}: Partition ${partition.partition}, Offset ${partition.offset} due to rebalance`,
			);

			const newPartition = new Partition(
				partition.partition,
				this.factory,
				this.consumer,
				this.logger,
				this.config,
			);

			// Listen for error events to know when the partition has stopped processing due to an error
			newPartition.on("error", (error, errorData: IContextErrorData) => {
				if (this.stopped) {
					Lumberjack.info(
						"Partition.onError: PartitionManager already stopped, not emitting error again",
						{ error, ...errorData },
					);
					return;
				}
				Lumberjack.verbose("Emitting error from partitionManager, partition error event");
				this.emit("error", error, errorData);
			});

			newPartition.on("pause", (partitionId: number, offset: number, reason?: any) => {
				this.emit("pause", partitionId, offset, reason);
			});

			newPartition.on("resume", (partitionId: number) => {
				this.emit("resume", partitionId);
			});

			this.partitions.set(partition.partition, newPartition);
		}
	}

	private sampleMessages(numberOfMessagesPerTrace: number): boolean {
		return this.getRandomInt(numberOfMessagesPerTrace) === 0;
	}

	private getRandomInt(range: number) {
		return Math.floor(Math.random() * range);
	}
}
