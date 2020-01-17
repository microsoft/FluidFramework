/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IConsumer, ICheckpointOffset } from "@microsoft/fluid-server-services-core";
import { EventEmitter } from "events";
import * as Kafka from "node-rdkafka";

interface ITopicPartition {
    topic: string;
    partition: number;
    offset?: number;
}

export class RdkafkaConsumer extends EventEmitter implements IConsumer {
    private consumer: Kafka.KafkaConsumer;

    constructor(
        kafkaBroker: string,
        clientId: string,
        public groupId: string,
        public topic: string,
        autoCommit: boolean) {
        super();

        // https://github.com/edenhill/librdkafka/wiki/How-to-decrease-message-latency
        this.consumer = new Kafka.KafkaConsumer(
            {
                "client.id": clientId,
                "enable.auto.commit": autoCommit,
                "event_cb": () => console.log("event_cb"),
                "fetch.min.bytes": 1,
                "fetch.wait.max.ms": 100,
                "group.id": groupId,
                "metadata.broker.list": kafkaBroker,
                "rebalance_cb": (err, assignment) => {
                    if (err.code === Kafka.CODES.ERRORS.ERR__ASSIGN_PARTITIONS) {
                        console.log("NEW ASSIGNMENTS", assignment);

                        this.emit("rebalancing", []);
                        this.emit("rebalanced", assignment);

                        // Note: this can throw when you are disconnected. Take care and wrap it in
                        // a try catch if that matters to you
                        this.consumer.assign(assignment);
                    } else if (err.code === Kafka.CODES.ERRORS.ERR__REVOKE_PARTITIONS) {
                        this.emit("rebalancing", []);
                        this.emit("rebalanced", []);

                        // assignment matches the topic/partition data structure
                        console.log("REMOVE ASSIGNMENTS", assignment);

                        // Same as above
                        this.consumer.unassign();
                    } else {
                        // We had a real error
                        console.error(err);
                    }
                },
            },
            {
                "auto.offset.reset": "latest",
            });

        // logging all errors
        this.consumer.on("event.error", (err) => {
            console.error("Error from consumer");
            console.error(err);
        });

        this.consumer.on("ready", (arg) => {
            console.log("consumer ready", arg);
            console.log("Assignments", this.consumer.assignments());

            this.consumer.subscribe([this.topic]);
            this.consumer.consume();
        });

        this.consumer.on("data", (m) => {
            this.emit("data", m);
        });

        // this.consumer.setDefaultConsumeTimeout(10);
        this.consumer.connect();
    }

    public commitOffset(partitionId: number, checkpointOffset: ICheckpointOffset): Promise<void> {
        const commitRequest = [{
            offset: checkpointOffset.offset,
            partition: partitionId,
            topic: this.topic,
        }];

        this.consumer.commit(commitRequest);

        return Promise.resolve();
    }

    public close(): Promise<void> {
        this.removeAllListeners();
        return new Promise<void>((resolve, reject) => {
            this.consumer.disconnect((err) => err ? reject(err) : resolve());
        });
    }

    public pause() {
        const assignments = this.consumer.assignments() as ITopicPartition[];
        this.consumer.pause(assignments);
    }

    public resume() {
        const assignments = this.consumer.assignments() as ITopicPartition[];
        this.consumer.resume(assignments);
    }
}
