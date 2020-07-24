/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IPubSub, ISubscriber, WebSocketSubscriber } from "@fluidframework/server-memory-orderer";
import * as core from "@fluidframework/server-services-core";
import { v4 as uuid } from "uuid";

export class LocalWebSocket implements core.IWebSocket {
    private readonly events = new EventEmitter();
    private readonly rooms = new Set<string>();
    private readonly subscriber: ISubscriber;

    constructor(public readonly id: string, private readonly server: LocalWebSocketServer) {
        this.subscriber = new WebSocketSubscriber(this);
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.events.on(event, listener);
    }

    public async join(roomId: string): Promise<void> {
        this.server.pubsub.subscribe(roomId, this.subscriber);
        this.rooms.add(roomId);
        return;
    }

    public send(event: string, ...args: any[]) {
        this.events.emit(event, ...args);
    }

    public emit(event: string, ...args: any[]) {
        this.events.emit(event, ...args);
    }

    public broadcastToRoom(roomId: string, event: string, ...args: any[]) {
        this.server.pubsub.publish(roomId, event, ...args);
    }

    public emitToRoom(roomId: string, event: string, ...args: any[]) {
        this.server.pubsub.publish(roomId, event, ...args);
    }

    public removeListener(event: string, listener: (...args: any[]) => void) {
        this.events.removeListener(event, listener);
    }

    public disconnect(close?: boolean) {
        for (const roomId of this.rooms) {
            this.server.pubsub.unsubscribe(roomId, this.subscriber);
        }
        this.emit("disconnect");
    }
}

export class LocalWebSocketServer implements core.IWebSocketServer {
    private readonly events = new EventEmitter();

    constructor(public readonly pubsub: IPubSub) {}

    public on(event: string, listener: (...args: any[]) => void) {
        this.events.on(event, listener);
    }

    public async close(): Promise<void> {
        this.events.removeAllListeners();
        return Promise.resolve();
    }

    public createConnection(): LocalWebSocket {
        const socket = new LocalWebSocket(uuid(), this);
        const mockRequest = { url: "TestWebSocket" };
        this.events.emit("connection", socket, mockRequest);
        return socket;
    }
}
