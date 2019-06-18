/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventHubConsumer } from "@prague/services";
import { IConsumer, IPartitionLambdaFactory } from "@prague/services-core";
import { IResourcesFactory } from "@prague/services-utils";
import * as moniker from "moniker";
import { Provider } from "nconf";
import { IKafkaResources } from "../kafka-service";

export class EventHubResources implements IKafkaResources {
    constructor(
        public lambdaFactory: IPartitionLambdaFactory,
        public consumer: IConsumer,
        public config: Provider) {
    }

    public async dispose(): Promise<void> {
        const consumerClosedP = this.consumer.close();
        await Promise.all([consumerClosedP]);
    }
}

export class EventHubResourcesFactory implements IResourcesFactory<EventHubResources> {
    constructor(private name, private lambdaModule) {
    }

    public async create(config: Provider): Promise<EventHubResources> {
        // tslint:disable-next-line:non-literal-require
        const plugin = require(this.lambdaModule);
        const lambdaFactory = await plugin.create(config) as IPartitionLambdaFactory;

        // Inbound Kafka configuration
        const endpoint = config.get("eventHub:endpoint");
        const storageEndpoint = config.get("eventHub:storageEndpoint");
        const storageContainer = config.get("eventHub:storageContainer");

        // Receive topic and group - for now we will assume an entry in config mapping
        // to the given name. Later though the lambda config will likely be split from the stream config
        const streamConfig = config.get(`lambdas:${this.name}`);
        const groupId = streamConfig.group;
        const receiveTopic = streamConfig.topic;

        console.log(`${groupId} ${receiveTopic}`);

        const clientId = moniker.choose();
        const consumer = new EventHubConsumer(
            endpoint,
            clientId,
            groupId,
            receiveTopic,
            true,
            storageEndpoint,
            storageContainer);

        return new EventHubResources(
            lambdaFactory,
            consumer,
            config);
    }
}
