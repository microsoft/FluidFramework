/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { HttpServer } from "@microsoft/fluid-server-services";
import {
    IWebServer,
    IWebServerFactory,
    IWebSocket,
    IWebSocketServer,
    RequestListener,
} from "@microsoft/fluid-server-services-core";
import { EventEmitter } from "events";
import * as http from "http";
import * as socketIo from "socket.io";
import { WebServer } from "./webServer";

class SocketIoSocket implements IWebSocket {
    public get id(): string {
        return this.socket.id;
    }

    constructor(private socket: SocketIO.Socket) {
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.socket.on(event, listener);
    }

    public async join(id: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.socket.join(id, (error) => error ? reject(error) : resolve());
        });
    }

    public async emit(event: string, ...args: any[]) {
        this.socket.emit(event, ...args);
    }

    public async emitToRoom(roomId: string, event: string, ...args: any[]) {
        this.socket.nsp.to(roomId).emit(event, ...args);
    }

    public async broadcastToRoom(roomId: string, event: string, ...args: any) {
        this.socket.to(roomId).broadcast.emit(event, ...args);
    }
}

class SocketIoServer extends EventEmitter implements IWebSocketServer {
    private io: SocketIO.Server;

    constructor(server: http.Server) {
        super();

        this.io = socketIo();
        this.io.attach(server);

        this.io.on("connection", (socket: SocketIO.Socket) => {
            const webSocket = new SocketIoSocket(socket);
            this.emit("connection", webSocket);
        });
    }

    public async close(): Promise<void> {
        await new Promise((resolve) => this.io.close(resolve));
    }
}

export class WebServerFactory implements IWebServerFactory {
    public create(requestListener: RequestListener): IWebServer {
        // Create the base HTTP server and register the provided request listener
        const server = http.createServer(requestListener);
        const httpServer = new HttpServer(server);

        const socketIoServer = new SocketIoServer(server);

        return new WebServer(httpServer, socketIoServer);
    }
}
