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
    IPartitionLambdaFactory } from "@microsoft/fluid-server-services-core";
import { Provider } from "nconf";
import * as winston from "winston";
import { Partition } from "./partition";

/**
 * The PartitionManager is responsible for maintaining a list of partitions for the given Kafka topic.
 * It will route incoming messages to the appropriate partition for the messages.
 */
export class PartitionManager extends EventEmitter {
    private partitions = new Map<number, Partition>();
    // Start rebalancing until we receive the first rebalanced message
    private isRebalancing = true;

    constructor(
        private readonly factory: IPartitionLambdaFactory,
        private readonly consumer: IConsumer,
        private readonly config: Provider) {
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
            partition.close();
        }
    }

    private process(message: IQueuedMessage) {
        if (this.isRebalancing) {
            winston.info(`Ignoring ${message.topic}:${message.partition}@${message.offset} due to pending rebalance`);
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

    private rebalancing(partitions: IPartition[]) {
        winston.info("rebalancing", partitions);
        this.isRebalancing = true;

        for (const [id, partition] of this.partitions) {
            winston.info(`Stopping partition ${id} due to rebalancing`);
            partition.close();
        }
    }

    private rebalanced(partitions: IPartitionWithEpoch[]) {
        this.isRebalancing = false;

        this.partitions = new Map<number, Partition>();
        for (const partition of partitions) {
            // eslint-disable-next-line max-len
            winston.info(`Creating ${partition.topic}: Partition ${partition.partition}, Epoch ${partition.leaderEpoch}, Offset ${partition.offset} due to rebalance`);

            const newPartition = new Partition(
                partition.partition,
                partition.leaderEpoch,
                this.factory,
                this.consumer,
                this.config);

            // Listen for error events to know when the partition has stopped processing due to an error
            newPartition.on("error", (error, restart) => {
                // For simplicity we will close the entire manager whenever any partition errors. In the case that the
                // restart flag is false and there was an error we will eventually need a way to signify that a
                // partition is 'poisoned'.
                this.emit("error", error, true);
            });

            this.partitions.set(partition.partition, newPartition);
        }
    }
}
