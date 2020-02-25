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
    topic: string): IConsumer =>
    new KafkaNodeConsumer({ kafkaHost: endPoint }, clientId, groupId, topic);

export const createProducer = (
    type: string,
    endPoint: string,
    clientId: string,
    topic: string,
    maxKafkaMessageSize: number): IProducer =>
    new KafkaNodeProducer({ kafkaHost: endPoint }, clientId, topic);
