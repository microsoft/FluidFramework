/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as core from "@microsoft/fluid-server-services-core";
import { EventEmitter } from "events";
import * as redis from "redis";
import * as socketIoEmitter from "socket.io-emitter";
import * as util from "util";

export class SocketIoRedisTopic implements core.ITopic {
    constructor(private topic: any) {
    }

    public emit(event: string, ...args: any[]) {
        this.topic.emit(event, ...args);
    }
}

export class SocketIoRedisPublisher implements core.IPublisher {
    private redisClient: redis.RedisClient;
    private io: any;
    private events = new EventEmitter();

    constructor(port: number, host: string, options: any) {
        this.redisClient = redis.createClient(port, host, options);
        this.io = socketIoEmitter(this.redisClient);

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

    public close(): Promise<void> {
        return util.promisify(((callback) => this.redisClient.quit(callback)) as any)();
    }
}
