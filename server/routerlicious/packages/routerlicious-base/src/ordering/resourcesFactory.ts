/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPartitionLambdaPlugin, IResourcesFactory } from "@fluidframework/server-services-core";
import {
	KafkaResources,
	KafkaResourcesFactory,
} from "@fluidframework/server-services-ordering-kafkanode";
import { RdkafkaResourcesFactory } from "@fluidframework/server-services-ordering-rdkafka";
import { ZookeeperClient } from "@fluidframework/server-services-ordering-zookeeper";
import { Provider } from "nconf";

/**
 * A generic kafka resources factory that picks rdkafka / kafka-node based on the config
 * @internal
 */
export class OrderingResourcesFactory implements IResourcesFactory<KafkaResources> {
	constructor(
		private readonly name: string,
		private readonly lambdaModule: string | IPartitionLambdaPlugin,
	) {}

	public async create(config: Provider): Promise<KafkaResources> {
		let resourcesFactory: IResourcesFactory<KafkaResources>;

		const kafkaLibName = config.get("kafka:lib:name");
		switch (kafkaLibName) {
			case "kafka-node":
				resourcesFactory = new KafkaResourcesFactory(this.name, this.lambdaModule);
				break;

			case "rdkafka":
				resourcesFactory = new RdkafkaResourcesFactory(
					this.name,
					this.lambdaModule,
					ZookeeperClient,
				);
				break;

			default:
				throw new Error(`Invalid kafka:lib:name "${kafkaLibName}"`);
		}

		return resourcesFactory.create(config);
	}
}
