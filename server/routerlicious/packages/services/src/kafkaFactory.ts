/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IConsumer, IProducer } from "@microsoft/fluid-server-services-core";
import { KafkaNodeConsumer } from "./kafkaNodeConsumer";
import { KafkaNodeProducer } from "./kafkaNodeProducer";

export const createConsumer = (
    type: string,
    endPoint: string,
    clientId: string,
    groupId: string,
    topic: string,
    autoCommit: boolean): IConsumer => new KafkaNodeConsumer(endPoint, clientId, groupId, topic, autoCommit);

export const createProducer = (
    type: string,
    endPoint: string,
    clientId: string,
    topic: string,
    maxKafkaMessageSize: number): IProducer => new KafkaNodeProducer(endPoint, clientId, topic);
