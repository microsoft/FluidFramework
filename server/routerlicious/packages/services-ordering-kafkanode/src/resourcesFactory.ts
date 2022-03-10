/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IConsumer,
    IPartitionLambdaFactory,
    IResources,
    IResourcesFactory,
} from "@fluidframework/server-services-core";
import sillyname from "sillyname";
import { Provider } from "nconf";
import { KafkaNodeConsumer } from "./kafkaNodeConsumer";

export interface IKafkaResources extends IResources {
    lambdaFactory: IPartitionLambdaFactory;

    consumer: IConsumer;

    config: Provider;
}

export class KafkaResources implements IKafkaResources {
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

export class KafkaResourcesFactory implements IResourcesFactory<KafkaResources> {
    constructor(private readonly name: string, private readonly lambdaModule: string) {
    }

    public async create(config: Provider): Promise<KafkaResources> {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
        const plugin = require(this.lambdaModule);
        const lambdaFactory = await plugin.create(config) as IPartitionLambdaFactory;

        // Inbound Kafka configuration
        const kafkaEndpoint = config.get("kafka:lib:endpoint");
        const zookeeperEndpoint = config.get("zookeeper:endpoint");
        const numberOfPartitions = config.get("kafka:lib:numberOfPartitions");
        const replicationFactor = config.get("kafka:lib:replicationFactor");

        // Receive topic and group - for now we will assume an entry in config mapping
        // to the given name. Later though the lambda config will likely be split from the stream config
        const streamConfig = config.get(`lambdas:${this.name}`);
        const groupId = streamConfig.group;
        const receiveTopic = streamConfig.topic;

        const clientId = (sillyname() as string).toLowerCase().split(" ").join("-");

        const consumer = new KafkaNodeConsumer(
            { kafkaHost: kafkaEndpoint },
            clientId,
            groupId,
            receiveTopic,
            zookeeperEndpoint,
            numberOfPartitions,
            replicationFactor,
        );

        return new KafkaResources(
            lambdaFactory,
            consumer,
            config);
    }
}
