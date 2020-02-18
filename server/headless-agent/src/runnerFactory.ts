/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable max-classes-per-file

import * as services from "@microsoft/fluid-server-services";
import * as core from "@microsoft/fluid-server-services-core";
import * as utils from "@microsoft/fluid-server-services-utils";
import { Provider } from "nconf";
import * as redis from "redis";
import { ICache, RedisCache } from "./redisCache";
import { HeadlessRunner } from "./runner";

export class HeadlessResources implements utils.IResources {
    constructor(
        public workerConfig: any,
        public messageReceiver: core.ITaskMessageReceiver,
        public cache: ICache) {
    }

    public async dispose(): Promise<void> {
        await this.messageReceiver.close();
    }
}

export class HeadlessResourcesFactory implements utils.IResourcesFactory<HeadlessResources> {
    public async create(config: Provider): Promise<HeadlessResources> {
        const rabbitmqConfig = config.get("rabbitmq");
        const redisConfig = config.get("redis");
        const redisOptions: redis.ClientOpts = { password: redisConfig.pass };
        if (redisConfig.tls) {
            redisOptions.tls = {
                serverName: redisConfig.host,
            };
        }

        const workerConfig = config.get("worker");
        const queueName = config.get("headless-agent:queue");

        const redisClient = redis.createClient(redisConfig.port, redisConfig.host, redisOptions);
        const cache = new RedisCache(redisClient);
        const messageReceiver = services.createMessageReceiver(rabbitmqConfig, queueName);

        return new HeadlessResources(workerConfig, messageReceiver, cache);
    }
}

export class HeadlessRunnerFactory implements utils.IRunnerFactory<HeadlessResources> {
    public async create(resources: HeadlessResources): Promise<utils.IRunner> {
        return new HeadlessRunner(
            resources.workerConfig,
            resources.messageReceiver,
            resources.cache);
    }
}
