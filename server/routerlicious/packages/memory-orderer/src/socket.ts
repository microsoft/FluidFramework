/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import type { IsoBuffer } from "@fluidframework/common-utils";
import ws from "ws";

import { debug } from "./debug";

export class Socket<T> extends EventEmitter {
	public static async connect<T>(address: string, path: string): Promise<Socket<T>> {
		const socket = new ws(`ws://${address}/${path}`);
		await new Promise<void>((resolve, reject) => {
			const errorListener = (error) => reject(error);
			socket.on("error", errorListener);
			socket.on("open", () => {
				socket.removeListener("error", errorListener);
				resolve();
			});
		});

		return new Socket<T>(socket);
	}

	private pending: T[] = [];
	private sendScheduled = false;
	private closed = false;
	private readonly errorHandler: (error: Error) => void;
	private readonly closeHandler: (code: number, reason: string) => void;
	private readonly messageHandler: (messagesJson: string) => void;

	constructor(private readonly socket: ws) {
		super();

		this.errorHandler = (error) => {
			debug(`ws error on connection to ${socket.url}`, error);
			this.emit("error", error);
		};
		this.socket.on("error", this.errorHandler);

		this.closeHandler = (code, reason) => {
			debug(`ws to ${socket.url} close ${code} ${reason}`);
			this.emit("close", code, reason);
		};
		this.socket.on("close", this.closeHandler);

		this.messageHandler = (messagesJson: string) => {
			const parsedMessages = JSON.parse(messagesJson);
			for (const parsedMessage of parsedMessages) {
				this.emit("message", parsedMessage);
			}
		};
		this.socket.on("message", this.messageHandler);
	}

	public close(): void {
		if (this.closed) {
			return;
		}
		this.closed = true;

		// Remove all listeners from the underlying ws socket
		this.socket.removeListener("error", this.errorHandler);
		this.socket.removeListener("close", this.closeHandler);
		this.socket.removeListener("message", this.messageHandler);

		// Close the underlying socket
		this.socket.close();

		// Clear pending messages and remove all listeners from this EventEmitter
		this.pending = [];
		this.removeAllListeners();
	}

	/**
	 * Sends the given value on the socket
	 */
	public send(value: T) {
		this.pending.push(value);

		if (this.sendScheduled) {
			return;
		}

		this.sendScheduled = true;
		setImmediate(() => {
			debug(`Sending ${this.pending.length} messages`);
			this.sendBuffers(this.pending);
			this.pending = [];
			this.sendScheduled = false;
		});
	}

	public on(event: "close", listener: (code: number, reason: string) => void): this;
	public on(event: "error", listener: (err: Error) => void): this;
	public on(event: "message", listener: (data: T) => void): this;
	public on(event: "open", listener: () => void): this;
	public on(event: "ping" | "pong", listener: (data: IsoBuffer) => void): this;
	public on(event: string | symbol, listener: (...args: any[]) => void): this {
		super.on(event, listener);
		return this;
	}

	private sendBuffers(buffers: T[]) {
		this.socket.send(JSON.stringify(buffers));
	}
}
