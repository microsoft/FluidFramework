/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import * as util from "util";
import * as core from "@fluidframework/server-services-core";
import Redis from "ioredis";
import { Emitter as SocketIoEmitter } from "@socket.io/redis-emitter";

export class SocketIoRedisTopic implements core.ITopic {
    constructor(private readonly topic: any) {
    }

    public emit(event: string, ...args: any[]) {
        this.topic.emit(event, ...args);
    }
}

export class SocketIoRedisPublisher implements core.IPublisher {
    private readonly redisClient: Redis.Redis;
    private readonly io: any;
    private readonly events = new EventEmitter();

    constructor(options: Redis.RedisOptions) {
        this.redisClient = new Redis(options);
        this.io = new SocketIoEmitter(this.redisClient);

        this.redisClient.on("error", (error) => {
            this.events.emit("error", error);
        });
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.events.on(event, listener);
    }

    public to(topic: string): core.ITopic {
        // NOTE - socket.io-emitter maintains local state during an emit request so we cannot cache the result of
        // doing a to, etc...
        return new SocketIoRedisTopic(this.io.to(topic));
    }

    public async emit(topic: string, event: string, ...args: any[]): Promise<void> {
        this.io.to(topic).emit(event, ...args);
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public close(): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return util.promisify(((callback) => this.redisClient.quit(callback)) as any)();
    }
}
