/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    IConsumer,
    IQueuedMessage,
    IPartition,
    IPartitionWithEpoch,
    IPartitionLambdaFactory,
    ILogger,
    LambdaCloseType,
    IContextErrorData,
} from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import { Partition } from "./partition";

/**
 * The PartitionManager is responsible for maintaining a list of partitions for the given Kafka topic.
 * It will route incoming messages to the appropriate partition for the messages.
 */
export class PartitionManager extends EventEmitter {
    private readonly partitions = new Map<number, Partition>();
    // Start rebalancing until we receive the first rebalanced message
    private isRebalancing = true;

    constructor(
        private readonly factory: IPartitionLambdaFactory,
        private readonly consumer: IConsumer,
        private readonly config: Provider,
        private readonly logger?: ILogger) {
        super();

        // Place new Kafka messages into our processing queue
        this.consumer.on("data", (message) => {
            this.process(message);
        });

        this.consumer.on("rebalancing", (partitions) => {
            this.rebalancing(partitions);
        });

        this.consumer.on("rebalanced", (partitions: IPartitionWithEpoch[]) => {
            this.rebalanced(partitions);
        });

        // On any Kafka errors immediately stop processing
        this.consumer.on("error", (error) => {
            this.emit("error", error);
        });
    }

    public async stop(): Promise<void> {
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

    private process(message: IQueuedMessage) {
        if (this.isRebalancing) {
            this.logger?.info(
                `Ignoring ${message.topic}:${message.partition}@${message.offset} due to pending rebalance`);
            return;
        }

        if (!this.partitions.has(message.partition)) {
            this.emit(
                "error",
                `Received message for untracked partition ${message.topic}:${message.partition}@${message.offset}`);
            return;
        }

        const partition = this.partitions.get(message.partition);
        partition.process(message);
    }

    /**
     * Called when rebalancing starts
     * Note: The consumer may decide to only emit "rebalanced" if it wants to skip closing existing partitions
     * @param partitions Assigned partitions before the rebalance
     */
    private rebalancing(partitions: IPartition[]) {
        this.logger?.info(`Rebalancing partitions: ${JSON.stringify(partitions)}`);

        this.isRebalancing = true;

        for (const [id, partition] of this.partitions) {
            this.logger?.info(`Closing partition ${id} due to rebalancing`);
            partition.close(LambdaCloseType.Rebalance);
        }

        this.partitions.clear();
    }

    /**
     * Called when rebalanced occurs
     * @param partitions Assigned partitions after the rebalance.
     * May contain partitions that have been previously assigned to this consumer
     */
    private rebalanced(partitions: IPartitionWithEpoch[]) {
        this.isRebalancing = false;

        const partitionsMap = new Map(partitions.map((partition) => [partition.partition, partition]));

        // close and remove existing partitions that are no longer assigned
        const existingPartitions = Array.from(this.partitions);
        for (const [id, partition] of existingPartitions) {
            if (!partitionsMap.has(id)) {
                this.logger?.info(`Closing partition ${id} due to rebalancing`);
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

            // eslint-disable-next-line max-len
            this.logger?.info(`Creating ${partition.topic}: Partition ${partition.partition}, Epoch ${partition.leaderEpoch}, Offset ${partition.offset} due to rebalance`);

            const newPartition = new Partition(
                partition.partition,
                partition.leaderEpoch,
                this.factory,
                this.consumer,
                this.config,
                this.logger);

            // Listen for error events to know when the partition has stopped processing due to an error
            newPartition.on("error", (error, errorData: IContextErrorData) => {
                // For simplicity we will close the entire manager whenever any partition errors. In the case that the
                // restart flag is false and there was an error we will eventually need a way to signify that a
                // partition is 'poisoned'.
                errorData.restart = true;
                this.emit("error", error, errorData);
            });

            this.partitions.set(partition.partition, newPartition);
        }
    }
}
