/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import * as util from "util";
import {
    IConsumer,
    IPartition,
    IPartitionWithEpoch,
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
 */
export class KafkaNodeConsumer implements IConsumer {
    private client: kafka.KafkaClient;
    private consumerGroup: kafka.ConsumerGroup;
    private readonly events = new EventEmitter();
    private readonly zookeeper: IZookeeperClient;

    constructor(
        private readonly clientOptions: kafka.KafkaClientOptions,
        clientId: string,
        public readonly groupId: string,
        public readonly topic: string,
        private readonly zookeeperEndpoint?: string,
        private readonly topicPartitions?: number,
        private readonly topicReplicationFactor?: number,
        private readonly reconnectDelay: number = defaultReconnectDelay) {
        clientOptions.clientId = clientId;
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.connect();
        if (zookeeperEndpoint) {
            this.zookeeper = new ZookeeperClient(zookeeperEndpoint);
        }
    }

    public async commitCheckpoint(partitionId: number, queuedMessage: IQueuedMessage): Promise<void> {
        // Although tagged as optional, kafka-node requies a value in the metadata field.
        // Also logs are replayed from the last checkponited offset. To avoid reprocessing the last message
        // twice, we checkpoint at offset + 1.
        const commitRequest: kafka.OffsetCommitRequest[] = [{
            metadata: "m",
            offset: queuedMessage.offset + 1,
            partition: partitionId,
            topic: this.topic,
        }];

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
        if (this.zookeeperEndpoint) {
            this.zookeeper.close();
        }
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
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
            await ensureTopics(this.client, [this.topic], this.topicPartitions, this.topicReplicationFactor);
        } catch (error) {
            // Close the client if it exists
            if (this.client) {
                this.client.close();
                this.client = undefined;
            }

            this.events.emit("error", error);

            setTimeout(() => {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this.connect();
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
            [this.topic]);

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

            let partitionsWithEpoch: IPartitionWithEpoch[];
            try {
                partitionsWithEpoch = await this.fetchPartitionEpochs(partitions);
            } catch (err) {
                this.events.emit("error", err);
            }

            this.events.emit("rebalanced", partitionsWithEpoch);
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

    private async fetchPartitionEpochs(partitions: IPartition[]): Promise<IPartitionWithEpoch[]> {
        let epochs: number[];

        if (this.zookeeperEndpoint) {
            const epochsP = new Array<Promise<number>>();
            for (const partition of partitions) {
                epochsP.push(this.zookeeper.getPartitionLeaderEpoch(this.topic, partition.partition));
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
