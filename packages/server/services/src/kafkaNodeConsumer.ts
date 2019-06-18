/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IConsumer, IPartition } from "@prague/services-core";
import { EventEmitter } from "events";
import * as kafkaNode from "kafka-node";
import * as util from "util";
import { debug } from "./debug";

export class KafkaNodeConsumer implements IConsumer {
    private client: kafkaNode.Client;
    private offset: kafkaNode.Offset;
    private instance: kafkaNode.HighLevelConsumer;
    private events = new EventEmitter();

    constructor(
        private endpoint: string,
        private clientId: string,
        public groupId: string,
        public topic: string,
        private autoCommit: boolean) {
        this.connect();
    }

    public commitOffset(commitRequest: any[]): Promise<void> {
        commitRequest.forEach((commit) => {
            commit.topic = this.topic;
            commit.offset = commit.offset as number + 1;
        });
        return new Promise<any>((resolve, reject) => {
            this.offset.commit(this.groupId, commitRequest, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(JSON.stringify(data));
                }
            });
        });
    }

    public async close(): Promise<void> {
        await util.promisify(((callback) => this.instance.close(false, callback)) as any)();
        await util.promisify(((callback) => this.client.close(callback)) as any)();
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public pause() {
        this.instance.pause();
    }

    public resume() {
        this.instance.resume();
    }

    private connect() {
        this.client = new kafkaNode.Client(this.endpoint, this.clientId);
        this.offset = new kafkaNode.Offset(this.client);
        const groupId = this.groupId;
        return new Promise<any>((resolve, reject) => {
            this.ensureTopics(this.client, [this.topic]).then(
                () => {
                    this.instance = new kafkaNode.HighLevelConsumer(
                        this.client,
                        [{topic: this.topic}],
                        {
                            autoCommit: this.autoCommit,
                            fetchMaxBytes: 1024 * 1024,
                            fetchMinBytes: 1,
                            fromOffset: true,
                            groupId,
                            maxTickMessages: 100000,
                        });

                    this.instance.on("rebalancing", () => {
                        const payloads = (this.instance as any).getTopicPayloads();
                        this.events.emit("rebalancing", this.getPartitions(payloads));
                    });

                    this.instance.on("rebalanced", () => {
                        const payloads = (this.instance as any).getTopicPayloads();
                        this.events.emit("rebalanced", this.getPartitions(payloads));
                    });

                    this.instance.on("message", (message: any) => {
                        this.events.emit("data", message);
                    });

                    this.instance.on("error", (error) => {
                        // Workaround to resolve rebalance partition error.
                        // https://github.com/SOHU-Co/kafka-node/issues/90
                        debug(`Error in kafka consumer: ${error}. Wait for 30 seconds and return error...`);
                        setTimeout(() => {
                            this.events.emit("error", error);
                        }, 30000);
                    });

                }, (error) => {
                    this.handleError(error);
                });
        });
    }

    private getPartitions(rawPartitions: any[]): IPartition[] {
        return rawPartitions.map((partition) => {
            return {
                offset: parseInt(partition.offset, 10),
                partition: parseInt(partition.partition, 10),
                topic: partition.topic,
            };
        });
    }

    private ensureTopics(client: kafkaNode.Client, topics: string[]): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            // We make use of a refreshMetadata call to validate the given topics exist
            client.refreshMetadata(
                topics,
                (error) => {
                    if (error) {
                        return reject(error);
                    }
                    return resolve();
                });
        });
    }

    /**
     * Handles an error that requires a reconnect to Kafka
     */
    private handleError(error: any) {
        // Close the client if it exists
        if (this.client) {
            this.client.close();
            this.client = undefined;
        }

        debug("Kafka error - attempting reconnect", error);
        this.connect();
    }
}
