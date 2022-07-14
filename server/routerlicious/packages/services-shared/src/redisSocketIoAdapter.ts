/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as msgpack from "notepack.io";
import * as socketio from "socket.io";
import { Adapter, BroadcastOptions, Room, SocketId } from "socket.io-adapter";
import { PacketType } from "socket.io-parser";
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
        interval: number;

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
export class RedisSocketIoAdapter extends Adapter {
    private static options: ISocketIoRedisOptions;
    private static shouldDisableDefaultNamespace: boolean;

    /**
     * Map of room id to socket ids
     * Shows what sockets are in a given room
     */
    public rooms: Map<Room, Set<SocketId>> = new Map();
    /**
     * Map of socket id to room ids
     * Shows what rooms the given socket is id
     */
    public sids: Map<SocketId, Set<Room>> = new Map();

    private _uniqueRoomCount = 0;

    private readonly uid: string;
    private readonly channel: string;

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
        super(nsp);

        // todo: better id here?
        this.uid = uuid.v4().substring(0, 6);

        this.channel = `socket.io#${nsp.name}#`;
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
     * Gets a list of sockets by sid.
     */
    public async sockets(rooms: Set<Room>): Promise<Set<SocketId>> {
        const sids = new Set<SocketId>();

        if (rooms.size) {
            for (const room of rooms) {
                const roomSockets = this.rooms.get(room);
                if (roomSockets) {
                    for (const id of roomSockets) {
                        if (this.nsp.sockets.has(id)) {
                            sids.add(id);
                        }
                    }
                }
            }
        } else {
            for (const id of this.sids.keys()) {
                if (this.nsp.sockets.has(id)) {
                    sids.add(id);
                }
            }
        }

        return sids;
    }

    /**
     * Gets the list of rooms a given socket has joined.
     */
    public socketRooms(id: SocketId): Set<Room> | undefined {
        return this.sids.get(id);
    }

    /**
     * Add a socket to a list of rooms
     */
    public async addAll(socketId: SocketId, roomIds: Set<Room>): Promise<void> {
        if (!this.isDefaultNamespaceAndDisable) {
            const newRooms: Room[] = [];

            for (const roomId of roomIds) {
                let socketRooms = this.sids.get(socketId);
                if (!socketRooms) {
                    socketRooms = new Set();
                    this.sids.set(socketId, socketRooms);
                }

                socketRooms.add(roomId);

                let roomSocketIds = this.rooms.get(roomId);
                if (!roomSocketIds) {
                    roomSocketIds = new Set();
                    this.rooms.set(roomId, roomSocketIds);

                    // don't count the built in user rooms
                    if (socketId !== roomId) {
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
    }

    /**
     * Removes a socket from a room
     */
    public async del(socketId: SocketId, roomId: Room): Promise<void> {
        if (!this.isDefaultNamespaceAndDisable) {
            this.sids.get(socketId)?.delete(roomId);

            const shouldUnsubscribe = this.removeFromRoom(socketId, roomId);
            if (shouldUnsubscribe) {
                // don't delay socket removal due to the redis subscription
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this.unsubscribeFromRooms([roomId]);
            }
        }
    }

    /**
     * Removes a socket
     */
    public async delAll(socketId: SocketId): Promise<void> {
        if (!this.isDefaultNamespaceAndDisable) {
            const rooms = this.sids.get(socketId);
            if (rooms) {
                const unsubscribeRooms: string[] = [];

                for (const roomId of rooms) {
                    const shouldUnsubscribe = this.removeFromRoom(socketId, roomId);
                    if (shouldUnsubscribe) {
                        unsubscribeRooms.push(roomId);
                    }
                }

                if (unsubscribeRooms.length > 0) {
                    // don't delay socket removal due to the redis subscription
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    this.unsubscribeFromRooms(unsubscribeRooms);
                }

                this.sids.delete(socketId);
            }
        }
    }

    /**
     * Broadcast packets
     */
    public broadcast(packet: any, opts: BroadcastOptions): void {
        if (this.isDefaultNamespaceAndDisable) {
            return;
        }

        if (opts.rooms.size !== 1) {
            // block full broadcasts and multi room broadcasts
            return;
        }

        super.broadcast(packet, opts);

        this.publish(packet, opts);
    }

    /**
     * Publishes the packet to Redis
     */
    private publish(packet: any, opts: BroadcastOptions) {
        // include the room in the channel name
        const channel = `${this.channel}${opts.rooms.values().next().value}#`;
        // don't provide any "opts"
        const msg = msgpack.encode([this.uid, packet]);

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

        if (room !== "" && !this.rooms.has(room)) {
            // ignore unknown room
            return;
        }

        const args = msgpack.decode(messageBuffer);

        const messageUid = args.shift();
        let packet = args[0];
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
            if (packet) {
                if (packet.data === undefined) {
                    // the data is the packet itself
                    // recreate the packet object
                    packet = {
                        data: packet,
                    };
                }

                if (packet.nsp === undefined) {
                    // default to this namespace
                    // the packet namespace is in the channel name
                    packet.nsp = this.nsp.name;
                }

                if (packet.type === undefined) {
                    // default to a normal socketio event
                    packet.type = PacketType.EVENT;
                }
            }

            if (!packet || packet.nsp !== this.nsp.name) {
                // ignoring different namespace
                throw new Error(`Invalid namespace. ${packet.nsp} !== ${this.nsp.name}`);
            }

            const opts: BroadcastOptions = {
                rooms: new Set([room]),
            };

            // only allow room broadcasts
            super.broadcast(packet, opts);

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
        const roomSocketIds = this.rooms.get(roomId);
        if (roomSocketIds) {
            roomSocketIds.delete(socketId);

            if (roomSocketIds.size === 0) {
                this.rooms.delete(roomId);

                // don't count the built in user rooms
                if (socketId !== roomId) {
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
        if (!RedisSocketIoAdapter.options.healthChecks) {
            return;
        }
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
