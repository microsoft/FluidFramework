/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Redis } from "ioredis";
import * as winston from "winston";
import { ISocketIoRedisConnection, ISocketIoRedisSubscriptionConnection } from "./redisSocketIoAdapter";

/**
 * Simple implementation of ISocketIoRedisConnection, which wraps a redis client
 * and only provides Pub functionality
 */
export class SocketIORedisConnection implements ISocketIoRedisConnection {
    constructor(protected readonly client: Redis) {
        client.on("error", (err) => {
            winston.error("Error with Redis:", err);
        });
    }

    public async publish(channel: string, message: string) {
        await this.client.publish(channel, message);
    }
}

/**
 * Simple implementation of ISocketIoRedisSubscriptionConnection, which wraps a node-redis client
 * and provides both pub and sub functionality
 */
export class SocketIoRedisSubscriptionConnection
        extends SocketIORedisConnection
        implements ISocketIoRedisSubscriptionConnection {
    /**
     * Map of pubsub callbacks
     */
    private readonly subscriptions: Map<string, (channel: string, messageBuffer: Buffer) => void> = new Map();

    constructor(client: Redis) {
        super(client);

        client.on("messageBuffer", (channelBuffer: Buffer, messageBuffer: Buffer) => {
            const channel = channelBuffer.toString();

            const callback = this.subscriptions.get(channel);
            if (!callback) {
                return;
            }

            callback(channel, messageBuffer);
        });
    }

    public async subscribe(
        channels: string | string[],
        callback: (channel: string, messageBuffer: Buffer) => void,
        forceSubscribe?: boolean) {
        let channelsArray = Array.isArray(channels) ? channels : [channels];
        const subscriptionsMap = this.subscriptions;

        if (!forceSubscribe) {
            channelsArray = channelsArray.filter((channel) => !subscriptionsMap.has(channel));
            if (channelsArray.length === 0) {
                return;
            }
        }

        await this.client.subscribe(...channelsArray);

        for (const channel of channelsArray) {
            subscriptionsMap.set(channel, callback);
        }
    }

    public async unsubscribe(channels: string | string[]) {
        let channelsArray = Array.isArray(channels) ? channels : [channels];
        const subscriptionsMap = this.subscriptions;

        channelsArray = channelsArray.filter((channel) => subscriptionsMap.has(channel));
        if (channelsArray.length === 0) {
            return;
        }

        await this.client.unsubscribe(channelsArray);

        for (const channel of channelsArray) {
            subscriptionsMap.delete(channel);
        }
    }

    public isSubscribed(channel: string): boolean {
        return this.subscriptions.has(channel);
    }
}
