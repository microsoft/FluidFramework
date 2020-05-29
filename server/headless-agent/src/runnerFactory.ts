/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable max-classes-per-file

import * as services from "@fluidframework/server-services";
import * as core from "@fluidframework/server-services-core";
import * as utils from "@fluidframework/server-services-utils";
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
        const workerConfig = config.get("worker");

        const rabbitmqConfig = config.get("rabbitmq");
        const redisConfig = config.get("redis");
        const redisOptions: redis.ClientOpts = { password: redisConfig.pass };
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (redisConfig.tls) {
            redisOptions.tls = {
                serverName: redisConfig.host,
            };
        }

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
