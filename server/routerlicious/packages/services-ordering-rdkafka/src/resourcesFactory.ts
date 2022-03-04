/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IConsumer,
    IPartitionLambdaFactory,
    IResources,
    IResourcesFactory,
    ZookeeperClientConstructor,
} from "@fluidframework/server-services-core";
import sillyname from "sillyname";
import { Provider } from "nconf";
import { RdkafkaConsumer } from "./rdkafkaConsumer";

export interface IRdkafkaResources extends IResources {
    lambdaFactory: IPartitionLambdaFactory;

    consumer: IConsumer;

    config: Provider;
}

export class RdkafkaResources implements IRdkafkaResources {
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

export class RdkafkaResourcesFactory implements IResourcesFactory<RdkafkaResources> {
    constructor(
        private readonly name: string,
        private readonly lambdaModule: string,
        private readonly zookeeperClientConstructor: ZookeeperClientConstructor) {
    }

    public async create(config: Provider): Promise<RdkafkaResources> {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
        const plugin = require(this.lambdaModule);
        const lambdaFactory = await plugin.create(config) as IPartitionLambdaFactory;

        // Inbound Kafka configuration
        const kafkaEndpoint: string = config.get("kafka:lib:endpoint");
        const zookeeperEndpoint: string = config.get("zookeeper:endpoint");
        const numberOfPartitions = config.get("kafka:lib:numberOfPartitions");
        const replicationFactor = config.get("kafka:lib:replicationFactor");
        const optimizedRebalance = config.get("kafka:lib:rdkafkaOptimizedRebalance");
        const automaticConsume = config.get("kafka:lib:rdkafkaAutomaticConsume");
        const consumeTimeout = config.get("kafka:lib:rdkafkaConsumeTimeout");
        const maxConsumerCommitRetries = config.get("kafka:lib:rdkafkaMaxConsumerCommitRetries");
        const sslCACertFilePath: string = config.get("kafka:lib:sslCACertFilePath");

        // Receive topic and group - for now we will assume an entry in config mapping
        // to the given name. Later though the lambda config will likely be split from the stream config
        const streamConfig = config.get(`lambdas:${this.name}`);
        const groupId = streamConfig.group;
        const receiveTopic = streamConfig.topic;

        const clientId = (sillyname() as string).toLowerCase().split(" ").join("-");

        const endpoints = {
            kafka: kafkaEndpoint ? kafkaEndpoint.split(",") : [],
            zooKeeper: zookeeperEndpoint ? zookeeperEndpoint.split(",") : [],
        };

        const consumer = new RdkafkaConsumer(
            endpoints,
            clientId,
            receiveTopic,
            groupId,
            {
                numberOfPartitions,
                replicationFactor,
                optimizedRebalance,
                automaticConsume,
                consumeTimeout,
                maxConsumerCommitRetries,
                sslCACertFilePath,
                zooKeeperClientConstructor: this.zookeeperClientConstructor,
            },
        );

        return new RdkafkaResources(
            lambdaFactory,
            consumer,
            config);
    }
}
