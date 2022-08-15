/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import * as http from "http";
import { HttpServer } from "@fluidframework/server-services-shared";
import {
    IWebServer,
    IWebServerFactory,
    IWebSocket,
    IWebSocketServer,
    RequestListener,
} from "@fluidframework/server-services-core";
import { Server, Socket } from "socket.io";
import { WebServer } from "./webServer";

class SocketIoSocket implements IWebSocket {
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

    public async broadcastToRoom(roomId: string, event: string, ...args: any) {
        this.socket.to(roomId).emit(event, ...args);
    }

    public disconnect(close?: boolean): void {
        this.socket.disconnect(close);
    }
}

class SocketIoServer extends EventEmitter implements IWebSocketServer {
    constructor(server: http.Server, private readonly io: Server) {
        super();

        this.io.attach(server);

        this.io.on("connection", (socket: Socket) => {
            const webSocket = new SocketIoSocket(socket);
            this.emit("connection", webSocket);
        });
    }

    public async close(): Promise<void> {
        await new Promise<void>((resolve) => this.io.close(() => resolve()));
    }
}

export class WebServerFactory implements IWebServerFactory {
    constructor(private readonly io: Server) {
    }

    public create(requestListener: RequestListener): IWebServer {
        // Create the base HTTP server and register the provided request listener
        const server = http.createServer(requestListener);
        const httpServer = new HttpServer(server);

        const socketIoServer = new SocketIoServer(server, this.io);

        return new WebServer(httpServer, socketIoServer);
    }
}
