/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventHubConsumer } from "@microsoft/fluid-server-services";
import { IConsumer, IPartitionLambdaFactory } from "@microsoft/fluid-server-services-core";
import { IResourcesFactory } from "@microsoft/fluid-server-services-utils";
import moniker from "moniker";
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
