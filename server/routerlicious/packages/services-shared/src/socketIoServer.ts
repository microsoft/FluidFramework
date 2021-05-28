/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import * as http from "http";
import * as util from "util";
import * as core from "@fluidframework/server-services-core";
import * as _ from "lodash";
import Redis from "ioredis";
import socketIo from "socket.io";
import socketIoRedis from "socket.io-redis";
import * as winston from "winston";
import * as redisSocketIoAdapter from "./redisSocketIoAdapter";
import { SocketIORedisConnection, SocketIoRedisSubscriptionConnection } from "./socketIoRedisConnection";

const socketJoin = util.promisify(
    (socket: SocketIO.Socket, roomId: string, callback: (err: NodeJS.ErrnoException) => void) => {
        socket.join(roomId, callback);
    });

class SocketIoSocket implements core.IWebSocket {
    public get id(): string {
        return this.socket.id;
    }

    constructor(private readonly socket: SocketIO.Socket) {
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.socket.on(event, listener);
    }

    public async join(id: string): Promise<void> {
        await socketJoin(this.socket, id);
    }

    public async emit(event: string, ...args: any[]) {
        this.socket.emit(event, ...args);
    }

    public async emitToRoom(roomId: string, event: string, ...args: any[]) {
        this.socket.nsp.to(roomId).emit(event, ...args);
    }

    public disconnect(close?: boolean) {
        this.socket.disconnect(close);
    }
}

class SocketIoServer implements core.IWebSocketServer {
    private readonly events = new EventEmitter();

    constructor(
        private readonly io: SocketIO.Server,
        private readonly pub: Redis.Redis,
        private readonly sub: Redis.Redis) {
        this.io.on("connection", (socket: SocketIO.Socket) => {
            const webSocket = new SocketIoSocket(socket);
            this.events.emit("connection", webSocket);
        });
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.events.on(event, listener);
    }

    public async close(): Promise<void> {
        const pubClosedP = util.promisify(((callback) => this.pub.quit(callback)) as any)();
        const subClosedP = util.promisify(((callback) => this.sub.quit(callback)) as any)();
        const ioClosedP = util.promisify(((callback) => this.io.close(callback)) as any)();
        await Promise.all([pubClosedP, subClosedP, ioClosedP]);
    }
}

export function create(
    redisConfig: any,
    server: http.Server,
    socketIoAdapterConfig?: any): core.IWebSocketServer {
    const options: Redis.RedisOptions = {
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.pass,
    };
    if (redisConfig.tls) {
        options.tls = {
            servername: redisConfig.host,
        };
    }

    const pub = new Redis(_.clone(options));
    const sub = new Redis(_.clone(options));

    pub.on("error", (err) => {
        winston.error("Error with Redis pub connection: ", err);
    });
    sub.on("error", (err) => {
        winston.error("Error with Redis sub connection: ", err);
    });

    // Create and register a socket.io connection on the server
    const io = socketIo();
    // Explicitly allow all origins. As a service that has potential to host countless different client apps,
    // it would impossible to hardcode or configure restricted CORS policies.
    io.origins((_origin, callback) => {
        callback(null, true);
    });

    let adapter: SocketIO.Adapter | undefined;

    if (socketIoAdapterConfig?.enableCustomSocketIoAdapter) {
        const socketIoRedisOptions: redisSocketIoAdapter.ISocketIoRedisOptions =
        {
            pubConnection: new SocketIORedisConnection(pub),
            subConnection: new SocketIoRedisSubscriptionConnection(sub),
        };

        redisSocketIoAdapter.RedisSocketIoAdapter.setup(
            socketIoRedisOptions,
            socketIoAdapterConfig?.shouldDisableDefaultNamespace);

        adapter = redisSocketIoAdapter.RedisSocketIoAdapter as any;
    }
    else {
        adapter = socketIoRedis({ pubClient: pub, subClient: sub });
    }

    io.attach(server);
    io.adapter(adapter);

    return new SocketIoServer(io, pub, sub);
}
