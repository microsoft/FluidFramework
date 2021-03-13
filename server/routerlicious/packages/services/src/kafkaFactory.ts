/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IConsumer, IProducer } from "@fluidframework/server-services-core";
import { KafkaNodeConsumer, KafkaNodeProducer } from "@fluidframework/server-services-ordering-kafkanode";
import { RdkafkaConsumer, RdkafkaProducer } from "@fluidframework/server-services-ordering-rdkafka";

export function createConsumer(
    type: string,
    kafkaEndPoint: string,
    zookeeperEndPoint: string,
    clientId: string,
    groupId: string,
    topic: string,
    numberOfPartitions?: number,
    replicationFactor?: number): IConsumer {
    if (type === "rdkafka") {
        const endpoints = { kafka: [kafkaEndPoint], zooKeeper: [zookeeperEndPoint] };
        return new RdkafkaConsumer(endpoints, clientId, topic, groupId, { numberOfPartitions, replicationFactor });
    }

    return new KafkaNodeConsumer({ kafkaHost: kafkaEndPoint }, clientId, groupId, topic, zookeeperEndPoint);
}

export function createProducer(
    type: string,
    kafkaEndPoint: string,
    clientId: string,
    topic: string,
    enableIdempotence?: boolean,
    pollIntervalMs?: number,
    numberOfPartitions?: number,
    replicationFactor?: number): IProducer {
    if (type === "rdkafka") {
        return new RdkafkaProducer(
            { kafka: [kafkaEndPoint] },
            clientId,
            topic,
            { enableIdempotence, pollIntervalMs, numberOfPartitions, replicationFactor });
    }

    return new KafkaNodeProducer({ kafkaHost: kafkaEndPoint }, clientId, topic);
}
