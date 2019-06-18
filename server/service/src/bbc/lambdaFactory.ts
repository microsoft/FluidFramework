/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BBCLambda } from "@prague/lambdas";
import { IContext, IPartitionLambda, IPartitionLambdaFactory, IPublisher, ITopic } from "@prague/services-core";
import { EventEmitter } from "events";
import { Provider } from "nconf";
import * as redis from "redis";

class RedisTopic implements ITopic {
    constructor(private io: redis.RedisClient, private topic: string) {
    }

    public emit(event: string, ...args: any[]) {
        this.io.publish(this.topic, JSON.stringify([event, ...args]));
    }
}

class RedisPublisher implements IPublisher {
    constructor(private io: redis.RedisClient) {
    }

    public on(event: string, listener: (...args: any[]) => void) {
        // throw new Error("Method not implemented.");
        this.io.on(event, listener);
    }

    public to(topic: string): ITopic {
        return new RedisTopic(this.io, topic);
    }
}

export class BBCLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(private io: redis.RedisClient) {
        super();

        this.io.on("error", (error) => {
            // After an IO error we need to recreate the lambda
            this.emit("error", error);
        });
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        return new BBCLambda(new RedisPublisher(this.io), context);
    }

    public async dispose(): Promise<void> {
        await this.io.quit();
    }
}
