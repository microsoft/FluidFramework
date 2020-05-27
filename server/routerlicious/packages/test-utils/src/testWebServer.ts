/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import * as core from "@fluidframework/server-services-core";
import * as moniker from "moniker";

export class TestWebSocket implements core.IWebSocket {
    private readonly events = new EventEmitter();
    private readonly rooms = new Set<string>();

    constructor(public id: string, private readonly server: TestWebSocketServer) {
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.events.on(event, listener);
    }

    public async join(id: string): Promise<void> {
        if (!this.server.rooms.has(id)) {
            this.server.rooms.set(id, new Set<TestWebSocket>());
        }
        this.server.rooms.get(id).add(this);
        this.rooms.add(id);
        return;
    }

    public send(event: string, ...args: any[]) {
        this.events.emit(event, ...args);
    }

    public emit(event: string, ...args: any[]) {
        this.events.emit(event, ...args);
    }

    public broadcastToRoom(roomId: string, event: string, ...args: any[]) {
        const sockets = this.server.rooms.get(roomId);
        if (sockets) {
            for (const socket of sockets) {
                if (socket !== this) {
                    socket.events.emit(event, ...args);
                }
            }
        }
    }

    public emitToRoom(roomId: string, event: string, ...args: any[]) {
        const sockets = this.server.rooms.get(roomId);
        if (sockets) {
            for (const socket of sockets) {
                socket.events.emit(event, ...args);
            }
        }
    }

    public removeListener(event: string, listener: (...args: any[]) => void) {
        this.events.removeListener(event, listener);
    }

    public disconnect(close?: boolean) {
        for (const room of this.rooms) {
            this.server.rooms.get(room).delete(this);
        }
    }
}

export class TestWebSocketServer implements core.IWebSocketServer {
    public rooms = new Map<string, Set<TestWebSocket>>();

    private readonly events = new EventEmitter();

    public on(event: string, listener: (...args: any[]) => void) {
        this.events.on(event, listener);
    }

    public async close(): Promise<void> {
        this.events.removeAllListeners();
        return Promise.resolve();
    }

    public createConnection(): TestWebSocket {
        const socket = new TestWebSocket(moniker.choose(), this);
        const mockRequest = { url: "TestWebSocket" };
        this.events.emit("connection", socket, mockRequest);
        return socket;
    }
}

export class TestHttpServer implements core.IHttpServer {
    private port: any;

    public async close(): Promise<void> {
        return Promise.resolve();
    }

    public listen(port: any) {
        this.port = port;
    }

    public on(event: string, listener: (...args: any[]) => void) {
        // Fill me in
    }

    public address(): { port: number; family: string; address: string } {
        return {
            address: "test",
            family: "test",
            port: this.port,
        };
    }
}

export class TestWebServer implements core.IWebServer {
    constructor(public httpServer: TestHttpServer, public webSocketServer: TestWebSocketServer) {
    }

    /**
     * Closes the web server
     */
    public async close(): Promise<void> {
        await Promise.all([this.httpServer.close(), this.webSocketServer.close()]);
    }
}

export class TestWebServerFactory implements core.IWebServerFactory {
    public create(requestListener: core.RequestListener): core.IWebServer {
        const testHttpServer = new TestHttpServer();
        const testWebSocketServer = new TestWebSocketServer();
        return new TestWebServer(testHttpServer, testWebSocketServer);
    }
}
