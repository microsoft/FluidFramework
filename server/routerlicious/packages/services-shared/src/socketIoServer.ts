/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import * as http from "http";
import * as util from "util";
import * as core from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { clone } from "lodash";
import Redis from "ioredis";
import { Namespace, Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Adapter } from "socket.io-adapter";
import * as winston from "winston";
import * as redisSocketIoAdapter from "./redisSocketIoAdapter";
import { SocketIORedisConnection, SocketIoRedisSubscriptionConnection } from "./socketIoRedisConnection";

class SocketIoSocket implements core.IWebSocket {
    public get id(): string {
        return this.socket.id;
    }

    constructor(private readonly socket: Socket) {
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.socket.on(event, listener);
    }

    public async join(id: string): Promise<void> {
        return this.socket.join(id);
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
        private readonly io: Server,
        private readonly pub: Redis.Redis,
        private readonly sub: Redis.Redis) {
        this.io.on("connection", (socket: Socket) => {
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
    socketIoAdapterConfig?: any,
    socketIoConfig?: any): core.IWebSocketServer {
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

    const pub = new Redis(clone(options));
    const sub = new Redis(clone(options));

    pub.on("error", (err) => {
        winston.error("Error with Redis pub connection: ", err);
        Lumberjack.error("Error with Redis pub connection", undefined, err);
    });
    sub.on("error", (err) => {
        winston.error("Error with Redis sub connection: ", err);
        Lumberjack.error("Error with Redis sub connection", undefined, err);
    });

    let adapter: (nsp: Namespace) => Adapter | undefined;
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
    } else {
        adapter = createAdapter(pub, sub);
    }

    // Create and register a socket.io connection on the server
    const io = new Server(server, {
        // Enable compatibility with socket.io v2 clients
        allowEIO3: true,
        // Indicates whether a connection should use compression
        perMessageDeflate: socketIoConfig?.perMessageDeflate ?? true,
        // Enable long-polling as a fallback
        transports: ["websocket", "polling"],
        cors: {
            // Explicitly allow all origins by reflecting request origin.
            // As a service that has potential to host countless different client apps,
            // it would impossible to hardcode or configure restricted CORS policies.
            origin: true,
            credentials: true,
        },
        adapter,
    });

    return new SocketIoServer(io, pub, sub);
}
