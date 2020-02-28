/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable max-classes-per-file

import { BlobServiceClient } from "@azure/storage-blob";
import * as services from "@microsoft/fluid-server-services";
import * as core from "@microsoft/fluid-server-services-core";
import * as utils from "@microsoft/fluid-server-services-utils";
import { Provider } from "nconf";
import * as redis from "redis";
import { ICache, RedisCache } from "./redisCache";
import { HeadlessRunner } from "./runner";
import { AzureBlobService, ISearchStorage } from "./searchStorage";

export class HeadlessResources implements utils.IResources {
    constructor(
        public workerConfig: any,
        public searchStorage: ISearchStorage,
        public messageReceiver: core.ITaskMessageReceiver,
        public cache: ICache) {
    }

    public async dispose(): Promise<void> {
        await this.messageReceiver.close();
    }
}

export class HeadlessResourcesFactory implements utils.IResourcesFactory<HeadlessResources> {
    public async create(config: Provider): Promise<HeadlessResources> {
        const workerConfig = config.get("worker");

        const rabbitmqConfig = config.get("rabbitmq");
        const redisConfig = config.get("redis");
        const redisOptions: redis.ClientOpts = { password: redisConfig.pass };
        if (redisConfig.tls) {
            redisOptions.tls = {
                serverName: redisConfig.host,
            };
        }

        const queueName = config.get("headless-agent:queue");

        const redisClient = redis.createClient(redisConfig.port, redisConfig.host, redisOptions);
        const cache = new RedisCache(redisClient);

        const messageReceiver = services.createMessageReceiver(rabbitmqConfig, queueName);

        const connectionString = config.get("headless-agent:searchEndpoint");
        const searchContainer = config.get("headless-agent:searchContainer");
        const blobServiceClient = await BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = await blobServiceClient.getContainerClient(searchContainer);
        const azureBlobService = new AzureBlobService(containerClient);

        return new HeadlessResources(workerConfig, azureBlobService, messageReceiver, cache);
    }
}

export class HeadlessRunnerFactory implements utils.IRunnerFactory<HeadlessResources> {
    public async create(resources: HeadlessResources): Promise<utils.IRunner> {
        return new HeadlessRunner(
            resources.workerConfig,
            resources.messageReceiver,
            resources.searchStorage,
            resources.cache);
    }
}
