/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import * as util from "util";
import { IConsumer, IPartition, IQueuedMessage } from "@microsoft/fluid-server-services-core";
import * as kafka from "kafka-node";
import { debug } from "./debug";
import { ensureTopics } from "./kafkaTopics";

// time before reconnecting after an error occurs
const defaultReconnectDelay = 5000;

export class KafkaNodeConsumer implements IConsumer {
    private client: kafka.KafkaClient;
    private offset: kafka.Offset;
    private consumerGroup: kafka.ConsumerGroup;
    private readonly events = new EventEmitter();

    constructor(
        private readonly clientOptions: kafka.KafkaClientOptions,
        clientId: string,
        public readonly groupId: string,
        public readonly topic: string,
        private readonly topicPartitions?: number,
        private readonly topicReplicationFactor?: number,
        private readonly reconnectDelay: number = defaultReconnectDelay) {
        clientOptions.clientId = clientId;
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.connect();
    }

    public async commitCheckpoint(partitionId: number, queuedMessage: IQueuedMessage): Promise<void> {
        const commitRequest = [{
            offset: queuedMessage.offset + 1,
            partition: partitionId,
            topic: this.topic,
        }];

        return new Promise<void>((resolve, reject) => {
            this.offset.commit(this.groupId, commitRequest, (err, data) => {
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
        this.offset = new kafka.Offset(this.client);

        const groupId = this.groupId;

        try {
            await ensureTopics(this.client, [this.topic], this.topicPartitions, this.topicReplicationFactor);
        } catch (error) {
            // Close the client if it exists
            if (this.client) {
                this.client.close();
                this.client = undefined;
            }

            debug("Kafka error - attempting reconnect", error);

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

        this.consumerGroup.on("rebalanced", () => {
            const payloads = (this.consumerGroup as any).topicPayloads;
            this.events.emit("rebalanced", this.getPartitions(payloads));
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
