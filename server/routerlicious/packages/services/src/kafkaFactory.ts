/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IConsumer, IProducer } from "@fluidframework/server-services-core";
import { KafkaNodeConsumer } from "./kafkaNodeConsumer";
import { KafkaNodeProducer } from "./kafkaNodeProducer";
import { RdkafkaConsumer } from "./rdkafkaConsumer";
import { RdkafkaProducer } from "./rdkafkaProducer";

export function createConsumer(
    type: string,
    kafkaEndPoint: string,
    zookeeperEndPoint: string,
    clientId: string,
    groupId: string,
    topic: string): IConsumer {
    if (type === "rdkafka") {
        const endpoints = { kafka: [kafkaEndPoint], zooKeeper: [zookeeperEndPoint] };
        return new RdkafkaConsumer(endpoints, clientId, topic, groupId);
    }

    return new KafkaNodeConsumer({ kafkaHost: kafkaEndPoint }, clientId, groupId, topic, zookeeperEndPoint);
}

export function createProducer(
    type: string,
    kafkaEndPoint: string,
    clientId: string,
    topic: string,
    maxKafkaMessageSize: number): IProducer {
    if (type === "rdkafka") {
        return new RdkafkaProducer({ kafka: [kafkaEndPoint] }, clientId, topic, false);
    }

    return new KafkaNodeProducer({ kafkaHost: kafkaEndPoint }, clientId, topic);
}
