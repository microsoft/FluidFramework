/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import * as util from "util";

import * as core from "@fluidframework/server-services-core";
import type { IRedisClientConnectionManager } from "@fluidframework/server-services-utils";
import { Emitter as SocketIoEmitter } from "@socket.io/redis-emitter";

/**
 * @internal
 */
export class SocketIoRedisTopic implements core.ITopic {
	constructor(private readonly topic: any) {}

	public emit(event: string, ...args: any[]) {
		this.topic.emit(event, ...args);
	}
}

/**
 * @internal
 */
export class SocketIoRedisPublisher implements core.IPublisher {
	private readonly redisClientConnectionManager: IRedisClientConnectionManager;
	private readonly io: any;
	private readonly events = new EventEmitter();

	constructor(redisClientConnectionManager: IRedisClientConnectionManager) {
		this.redisClientConnectionManager = redisClientConnectionManager;
		this.io = new SocketIoEmitter(redisClientConnectionManager.getRedisClient());

		redisClientConnectionManager.addErrorHandler(
			undefined, // lumber properties
			"Error with SocketIoRedisPublisher", // error message
			(error) => {
				this.events.emit("error", error);
				return false;
			},
		);
	}

	public on(event: string, listener: (...args: any[]) => void) {
		this.events.on(event, listener);
	}

	public to(topic: string): core.ITopic {
		// NOTE - socket.io-emitter maintains local state during an emit request so we cannot cache the result of
		// doing a to, etc...
		return new SocketIoRedisTopic(this.io.to(topic));
	}

	public async emit(topic: string, event: string, ...args: any[]): Promise<void> {
		this.io.to(topic).emit(event, ...args);
	}

	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public close(): Promise<void> {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/promise-function-async
		return util.promisify(((callback) =>
			this.redisClientConnectionManager.getRedisClient().quit(callback)) as any)();
	}
}
