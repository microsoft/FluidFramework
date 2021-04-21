/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import * as msgpack from "notepack.io";
import * as socketio from "socket.io";
import * as uuid from "uuid";

import { promiseTimeout } from "@fluidframework/server-services-client";

export interface ISocketIoRedisConnection {
    publish(channel: string, message: string): Promise<void>;
}

export interface ISocketIoRedisSubscriptionConnection extends ISocketIoRedisConnection {
    subscribe(
        channels: string | string[],
        callback: (channel: string, messageBuffer: Buffer) => void,
        forceSubscribe?: boolean): Promise<void>;
    unsubscribe(channels: string | string[]): Promise<void>;
    isSubscribed(channel: string): boolean;
}

export interface ISocketIoRedisOptions {
    // the connection used for publishing messages
    pubConnection: ISocketIoRedisConnection;

    // the connection used for subscriptions
    subConnection: ISocketIoRedisSubscriptionConnection;

    // when set, enables per room health checks. messages are periodically published
    healthChecks?: {
        // how often to health check each room in milliseconds
        interval: number,

        // how long to wait for a health check to complete before failing it in milliseconds
        timeout: number;

        // determines if the adapter should resubscribe to the room if a health check fails
        resubscribeOnFailure: boolean;

        // called when a health check succeeds or fails. useful for telemetry purposes
        onHealthCheck?(callerId: string, startTime: number, error?: any): void;
    };

    // called when receiving a message. useful for telemetry purposes
    onReceive?(channel: string, startTime: number, packet: any, error?: any): void;
}

/**
 * Custom version of the socket.io-redis adapter
 * Differences between this and socket.io-redis:
 * - Creates per room subscriptions which significantly reduces Redis server load for
 * Fluid scenarios when running a large amount of Fluid frontend servers.
 * - Contains a health checker that verifies each room is works *
 * - Optionally disables rooms for the default "/" namespace to reduce memory usage
 * (https://github.com/socketio/socket.io/issues/3089)
 * - Callbacks for telemetry logging
 * The Redis pubsub channels are compatible with socket.io-redis
 * References:
 * - https://github.com/socketio/socket.io-redis
 * - https://github.com/socketio/socket.io-emitter
 * - https://github.com/socketio/socket.io-adapter
 */
export class RedisSocketIoAdapter extends EventEmitter implements socketio.Adapter {
    private static options: ISocketIoRedisOptions;
    private static shouldDisableDefaultNamespace: boolean;

    // required for socketio.Adapter typing - however these are not used within socketio
    public rooms: any = undefined;
    public sids: any = undefined;

    /**
     * Map of room id to socket ids
     * Shows what sockets are in a given room
     */
    public readonly roomToSocketIds: Map<string, Set<string>> = new Map();

    /**
     * Map of socket id to room ids
     * Shows what rooms the given socket is id
     */
    private readonly socketIdToRooms: Map<string, Set<string>> = new Map();

    private _uniqueRoomCount = 0;

    private readonly uid: string;
    private readonly channel: string;
    private readonly encoder: any;

    private readonly pendingHealthChecks: Map<string, () => void> = new Map();
    private readonly roomHealthCheckTimeoutIds: Map<string, NodeJS.Timeout> = new Map();

    /**
     * Set the Redis connections to use
     */
    public static setup(options: ISocketIoRedisOptions, shouldDisableDefaultNamespace?: boolean) {
        this.options = options;
        this.shouldDisableDefaultNamespace = shouldDisableDefaultNamespace ?? false;
    }

    constructor(public readonly nsp: socketio.Namespace) {
        super();

        this.encoder = (nsp.server as any).encoder;

        // todo: better id here?
        this.uid = uuid.v4().substring(0, 6);

        this.channel = `socket.io#${nsp.name}#`;

        if (this.isDefaultNamespaceAndDisable) {
            // the default namespace
            // don't setup stuff for the default namespace. we only use /fluid. this will save memory
            // related to https://github.com/socketio/socket.io/issues/3089
            return;
        }
    }

    /**
     * Check if this instance is connected to the default socket io namespace
     */
    public get isDefaultNamespaceAndDisable() {
        return RedisSocketIoAdapter.shouldDisableDefaultNamespace && this.nsp.name === "/";
    }

    /**
     * Returns the number of unique rooms (not including built in user rooms)
     */
    public get uniqueRoomCount() {
        return this._uniqueRoomCount;
    }

    /**
     * Add a socket to a room
     */
    public async add(socketId: string, roomId: string, callback?: ((err?: any) => void) | undefined): Promise<void> {
        return this.addAll(socketId, [roomId], callback);
    }

    /**
     * Add a socket to a list of rooms
     */
    public async addAll(
        socketId: string,
        roomIds: string[],
        callback?: ((err?: any) => void) | undefined): Promise<void> {
        if (!this.isDefaultNamespaceAndDisable) {
            const newRooms: string[] = [];

            for (const roomId of roomIds) {
                let socketRooms = this.socketIdToRooms.get(socketId);
                if (!socketRooms) {
                    socketRooms = new Set();
                    this.socketIdToRooms.set(socketId, socketRooms);
                }

                socketRooms.add(roomId);

                let roomSocketIds = this.roomToSocketIds.get(roomId);
                if (!roomSocketIds) {
                    roomSocketIds = new Set();
                    this.roomToSocketIds.set(roomId, roomSocketIds);

                    // don't count the built in user rooms
                    if (!roomId.startsWith("/")) {
                        this._uniqueRoomCount++;

                        newRooms.push(roomId);
                    }
                }

                roomSocketIds.add(socketId);
            }

            if (newRooms.length > 0) {
                // subscribe to the new rooms
                await this.subscribeToRooms(newRooms);
            }
        }

        if (callback) {
            process.nextTick(callback);
        }
    }

    /**
     * Removes a socket from a room
     */
    public del(socketId: string, roomId: string, callback?: ((err?: any) => void) | undefined): void {
        if (!this.isDefaultNamespaceAndDisable) {
            this.socketIdToRooms.get(socketId)?.delete(roomId);

            const shouldUnsubscribe = this.removeFromRoom(socketId, roomId);
            if (shouldUnsubscribe) {
                // don't delay socket removal due due to the redis subscription
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this.unsubscribeFromRooms([roomId]);
            }
        }

        if (callback) {
            process.nextTick(callback);
        }
    }

    /**
     * Removes a socket
     */
    public delAll(socketId: string, callback?: () => void): void {
        if (!this.isDefaultNamespaceAndDisable) {
            const rooms = this.socketIdToRooms.get(socketId);
            if (rooms) {
                const unsubscribeRooms = [];

                for (const roomId of rooms) {
                    const shouldUnsubscribe = this.removeFromRoom(socketId, roomId);
                    if (shouldUnsubscribe) {
                        unsubscribeRooms.push(roomId);
                    }
                }

                if (unsubscribeRooms.length > 0) {
                    // don't delay socket removal due due to the redis subscription
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    this.unsubscribeFromRooms(unsubscribeRooms);
                }

                this.socketIdToRooms.delete(socketId);
            }
        }

        if (callback) {
            process.nextTick(callback);
        }
    }

    /**
     * Broadcast packets
     */
    public broadcast(
        packet: any,
        opts: {
            rooms?: string[] | undefined;
            except?: string[] | undefined;
            flags?: { [flag: string]: boolean; } | undefined;
        },
        remote?: boolean): void {
        if (this.isDefaultNamespaceAndDisable) {
            return;
        }

        if (!remote) {
            this.publish(packet, opts);
        }

        const rooms = opts.rooms ?? [];
        const except = opts.except ?? [];
        const flags = opts.flags ?? {};
        const packetOpts = {
            preEncoded: true,
            volatile: flags.volatile,
            compress: flags.compress,
        };
        const ids: Record<string, boolean> = {};

        if (rooms.length === 0) {
            // explicitly disable broadcasting to all rooms
            // we will never do this
            return;
        }

        this.encoder.encode(packet, (encodedPackets: any) => {
            for (const roomId of rooms) {
                const roomSocketIds = this.roomToSocketIds.get(roomId);
                if (!roomSocketIds) {
                    continue;
                }

                for (const socketId of roomSocketIds) {
                    // eslint-disable-next-line no-bitwise
                    if (ids[socketId] || ~except.indexOf(socketId)) {
                        continue;
                    }

                    const socket = this.nsp.connected[socketId];
                    if (socket) {
                        (socket as any).packet(encodedPackets, packetOpts);
                        ids[socketId] = true;
                    }
                }
            }
        });
    }

    /**
     * Publishes the packet to Redis
     */
    private publish(packet: any, opts: { rooms?: string[] | undefined; except?: string[] | undefined }) {
        packet.nsp = this.nsp.name;

        const msg = msgpack.encode([this.uid, packet, opts]);

        let channel = this.channel;
        if (opts.rooms?.length === 1) {
            channel += `${opts.rooms[0]}#`;
        }

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        RedisSocketIoAdapter.options.pubConnection.publish(channel, msg);
    }

    /**
     * Handles messages from the Redis subscription
     */
    private onRoomMessage(channel: string, messageBuffer: Buffer) {
        if (!channel.startsWith(this.channel)) {
            // sent to different channel
            return;
        }

        const room = channel.slice(this.channel.length, -1);

        if (room !== "" && !this.roomToSocketIds.has(room)) {
            // ignore unknown room
            return;
        }

        const args = msgpack.decode(messageBuffer);

        const messageUid = args.shift();
        const packet = args[0];
        const isHealthCheckPacket = typeof (packet) === "string";

        if (this.uid === messageUid) {
            if (isHealthCheckPacket) {
                // this is a health check packet sent to the per room subscription
                // the message was sent by this server to itself for the health check. complete the health check now
                this.pendingHealthChecks.get(packet)?.();
            }

            return;
        } else if (isHealthCheckPacket) {
            // ignore health check packets sent by other servers
            return;
        }

        const startTime = Date.now();

        try {
            if (packet && packet.nsp === undefined) {
                packet.nsp = "/";
            }

            if (!packet || packet.nsp !== this.nsp.name) {
                // ignoring different namespace
                throw new Error(`Invalid namespace. ${packet.nsp} !== ${this.nsp.name}`);
            }

            let opts: { rooms?: string[] | undefined } = args[1];

            if (!opts || !opts.rooms || opts.rooms.length === 0) {
                opts = {
                    rooms: [room],
                };
            }

            this.broadcast(packet, opts, true);

            if (RedisSocketIoAdapter.options.onReceive) {
                RedisSocketIoAdapter.options.onReceive(channel, startTime, packet);
            }
        } catch (ex) {
            if (RedisSocketIoAdapter.options.onReceive) {
                RedisSocketIoAdapter.options.onReceive(channel, startTime, packet, ex);
            }
        }
    }

    /**
     * Removes a socket from the room
     */
    private removeFromRoom(socketId: string, roomId: string) {
        const roomSocketIds = this.roomToSocketIds.get(roomId);
        if (roomSocketIds) {
            roomSocketIds.delete(socketId);

            if (roomSocketIds.size === 0) {
                this.roomToSocketIds.delete(roomId);

                // don't count the built in user rooms
                if (!roomId.startsWith("/")) {
                    this._uniqueRoomCount--;
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Subscribes to the rooms and starts the health checkers
     */
    private async subscribeToRooms(rooms: string[]) {
        await RedisSocketIoAdapter.options.subConnection.subscribe(
            this.getChannelNames(rooms),
            this.onRoomMessage.bind(this), true);

        for (const room of rooms) {
            this.queueRoomHealthCheck(room);
        }
    }

    /**
     * Unsubscribes to the rooms and clears the health checkers
     */
    private async unsubscribeFromRooms(rooms: string[]) {
        await RedisSocketIoAdapter.options.subConnection.unsubscribe(this.getChannelNames(rooms));

        for (const room of rooms) {
            this.clearRoomHealthCheckTimeout(room);
        }
    }

    private getChannelNames(rooms: string[]) {
        return rooms.map((room) => `${this.channel}${room}#`);
    }

    /**
     * Queues a future health check
     */
    private queueRoomHealthCheck(room: string) {
        this.clearRoomHealthCheckTimeout(room);

        if (!RedisSocketIoAdapter.options.healthChecks ||
            !RedisSocketIoAdapter.options.subConnection.isSubscribed(room)) {
            return;
        }

        const timeoutId = setTimeout(
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            async () => {
                return this.runRoomHealthCheck(room);
            },
            RedisSocketIoAdapter.options.healthChecks.interval);
        this.roomHealthCheckTimeoutIds.set(room, timeoutId);
    }

    /**
     * Runs a health check
     * It will publish a message over the pub connection and wait until it receives it
     */
    private async runRoomHealthCheck(room: string) {
        const healthCheckId = uuid.v4();

        const startTime = Date.now();

        const callerId = `${room},${healthCheckId}`;

        try {
            const msg = msgpack.encode([this.uid, healthCheckId]);

            const healthCheckPromise = new Promise<void>((resolve) => {
                this.pendingHealthChecks.set(healthCheckId, resolve);
            });

            // tslint:disable-next-line: no-floating-promises
            await RedisSocketIoAdapter.options.pubConnection.publish(`${this.channel}${room}#`, msg);

            await promiseTimeout(RedisSocketIoAdapter.options.healthChecks.timeout, healthCheckPromise);

            if (RedisSocketIoAdapter.options.healthChecks.onHealthCheck) {
                RedisSocketIoAdapter.options.healthChecks.onHealthCheck(callerId, startTime);
            }
        } catch (ex) {
            if (RedisSocketIoAdapter.options.healthChecks.onHealthCheck) {
                RedisSocketIoAdapter.options.healthChecks.onHealthCheck(callerId, startTime, ex);
            }

            if (RedisSocketIoAdapter.options.healthChecks.resubscribeOnFailure) {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this.subscribeToRooms([room]);
            }
        } finally {
            this.pendingHealthChecks.delete(healthCheckId);
        }

        // queue a health check even though we are not currrently subscribed
        // the fact that this health check timer is still running means we still want to be subscribed to the room
        // likely caused by a redis disconnection & a reconnection is in progress
        this.queueRoomHealthCheck(room);
    }

    /**
     * Clears the health check timeout
     */
    private clearRoomHealthCheckTimeout(room: string) {
        const timeoutId = this.roomHealthCheckTimeoutIds.get(room);
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
            this.roomHealthCheckTimeoutIds.delete(room);
        }
    }
}
