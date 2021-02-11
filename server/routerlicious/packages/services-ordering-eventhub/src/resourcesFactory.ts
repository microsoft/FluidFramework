/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IConsumer, IPartitionLambdaFactory } from "@fluidframework/server-services-core";
import { IResources, IResourcesFactory } from "@fluidframework/server-services-utils";
import * as moniker from "moniker";
import { Provider } from "nconf";
import { EventHubConsumer } from "./eventHubConsumer";

export interface IEventHubResources extends IResources {
    lambdaFactory: IPartitionLambdaFactory;

    consumer: IConsumer;

    config: Provider;
}

export class EventHubResources implements IEventHubResources {
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
    constructor(private readonly name, private readonly lambdaModule) {
    }

    public async create(config: Provider): Promise<EventHubResources> {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
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
            storageEndpoint,
            storageContainer);

        return new EventHubResources(
            lambdaFactory,
            consumer,
            config);
    }
}
