/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import events_pkg from "events_pkg";
const { EventEmitter } = events_pkg;
import { IPubSub, ISubscriber, WebSocketSubscriber } from "@fluidframework/server-memory-orderer";
import { IWebSocket, IWebSocketServer } from "@fluidframework/server-services-core";
import { v4 as uuid } from "uuid";

/**
 * @internal
 */
export class LocalWebSocket implements IWebSocket {
	private readonly events = new EventEmitter();
	private readonly rooms = new Set<string>();
	private readonly subscriber: ISubscriber;

	private _connected = true;
	public get connected() {
		return this._connected;
	}

	constructor(
		public readonly id: string,
		private readonly server: LocalWebSocketServer,
	) {
		this.subscriber = new WebSocketSubscriber(this);
	}

	public get handshake(): any {
		return undefined;
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

	public emitToRoom(roomId: string, event: string, ...args: any[]) {
		this.server.pubsub.publish(roomId, event, ...args);
	}

	public removeListener(event: string, listener: (...args: any[]) => void) {
		this.events.removeListener(event, listener);
	}

	// Add `off` method the socket which is called by the base class `DocumentDeltaConnection` to remove
	// event listeners.
	// We may have to add more methods from SocketIOClient.Socket if they start getting used.
	public off(event: string, listener: (...args: any[]) => void) {
		this.removeListener(event, listener);
		return this;
	}

	public disconnect(close?: boolean) {
		for (const roomId of this.rooms) {
			this.server.pubsub.unsubscribe(roomId, this.subscriber);
		}
		this._connected = false;
		this.emit("disconnect");
	}
}

/**
 * @internal
 */
export class LocalWebSocketServer implements IWebSocketServer {
	private readonly events = new EventEmitter();

	constructor(public readonly pubsub: IPubSub) {}

	public get handshake(): any {
		return undefined;
	}

	public on(event: string, listener: (...args: any[]) => void) {
		this.events.on(event, listener);
	}

	public async close(): Promise<void> {
		this.events.removeAllListeners();
	}

	public createConnection(): LocalWebSocket {
		const socket = new LocalWebSocket(uuid(), this);
		const mockRequest = { url: "TestWebSocket" };
		this.events.emit("connection", socket, mockRequest);
		return socket;
	}
}
