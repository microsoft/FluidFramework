/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IConsumer,
	IPartitionLambdaPlugin,
	IPartitionLambdaFactory,
	IResources,
	IResourcesFactory,
	ZookeeperClientConstructor,
} from "@fluidframework/server-services-core";
import sillyname from "sillyname";
import { Provider } from "nconf";
import { RdkafkaConsumer } from "./rdkafkaConsumer";

/**
 * @internal
 */
export interface IRdkafkaResources extends IResources {
	lambdaFactory: IPartitionLambdaFactory;

	consumer: IConsumer;

	config: Provider;
}

/**
 * @internal
 */
export class RdkafkaResources implements IRdkafkaResources {
	constructor(
		public lambdaFactory: IPartitionLambdaFactory,
		public consumer: IConsumer,
		public config: Provider,
	) {}

	public async dispose(): Promise<void> {
		const consumerClosedP = this.consumer.close();
		await Promise.all([consumerClosedP]);
	}
}

/**
 * @internal
 */
export class RdkafkaResourcesFactory implements IResourcesFactory<RdkafkaResources> {
	constructor(
		private readonly name: string,
		private readonly lambdaModule: string | IPartitionLambdaPlugin,
		private readonly zookeeperClientConstructor: ZookeeperClientConstructor,
	) {}

	public async create(config: Provider): Promise<RdkafkaResources> {
		const plugin: IPartitionLambdaPlugin =
			typeof this.lambdaModule === "string"
				? // eslint-disable-next-line @typescript-eslint/no-require-imports
				  require(this.lambdaModule)
				: this.lambdaModule;

		const customizations = await (plugin.customize ? plugin.customize(config) : undefined);
		const lambdaFactory = await plugin.create(config, customizations);

		// Inbound Kafka configuration
		const kafkaEndpoint: string = config.get("kafka:lib:endpoint");
		const zookeeperEndpoint: string = config.get("zookeeper:endpoint");
		const numberOfPartitions = config.get("kafka:lib:numberOfPartitions");
		const replicationFactor = config.get("kafka:lib:replicationFactor");
		const optimizedRebalance = config.get("kafka:lib:rdkafkaOptimizedRebalance");
		const automaticConsume = config.get("kafka:lib:rdkafkaAutomaticConsume");
		const consumeTimeout = config.get("kafka:lib:rdkafkaConsumeTimeout");
		const maxConsumerCommitRetries = config.get("kafka:lib:rdkafkaMaxConsumerCommitRetries");
		const consumeLoopTimeoutDelay = config.get("kafka:lib:rdkafkaConsumeLoopTimeoutDelay");
		const sslCACertFilePath: string = config.get("kafka:lib:sslCACertFilePath");
		const eventHubConnString: string = config.get("kafka:lib:eventHubConnString");
		const oauthBearerConfig = config.get("kafka:lib:oauthBearerConfig");
		const customRestartOnKafkaErrorCodes = config.get("kafka:customRestartOnKafkaErrorCodes");
		const consumerGlobalAdditionalConfig = config.get(
			"kafka:lib:consumerGlobalAdditionalConfig",
		);

		// apiCounter configuration
		const apiCounterEnabled = config.get("kafka:apiCounterEnabled") ?? false;
		const apiCounterIntervalMS = config.get("kafka:apiCounterIntervalMS") ?? 60000;
		const apiFailureRateTerminationThreshold =
			config.get("kafka:apiFailureRateTerminationThreshold") ?? 2; // 1 means 100%, 2 means disabled
		const apiMinimumCountToEnableTermination =
			config.get("kafka:apiMinimumCountToEnableTermination") ?? 20;
		const consecutiveFailedThresholdForLowerTotalRequests =
			config.get("kafka:consecutiveFailedThresholdForLowerTotalRequests") ?? 3;
		const ignoreAndSkipCheckpointOnKafkaErrorCodes =
			config.get("kafka:ignoreAndSkipCheckpointOnKafkaErrorCodes") ?? [];

		const apiCounterConfig = {
			apiCounterEnabled,
			apiCounterIntervalMS,
			apiFailureRateTerminationThreshold,
			apiMinimumCountToEnableTermination,
			consecutiveFailedThresholdForLowerTotalRequests,
		};

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

		const options = {
			numberOfPartitions,
			replicationFactor,
			optimizedRebalance,
			automaticConsume,
			consumeTimeout,
			maxConsumerCommitRetries,
			consumeLoopTimeoutDelay,
			sslCACertFilePath,
			zooKeeperClientConstructor: this.zookeeperClientConstructor,
			eventHubConnString,
			oauthBearerConfig,
			restartOnKafkaErrorCodes: customRestartOnKafkaErrorCodes,
			additionalOptions: consumerGlobalAdditionalConfig,
		};

		const consumer = new RdkafkaConsumer(
			endpoints,
			clientId,
			receiveTopic,
			groupId,
			apiCounterConfig,
			ignoreAndSkipCheckpointOnKafkaErrorCodes,
			options,
		);

		return new RdkafkaResources(lambdaFactory, consumer, config);
	}
}
