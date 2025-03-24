/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import type { ICollaborationSessionEvents } from "@fluidframework/server-lambdas";
import { Emitter as RedisEmitter } from "@socket.io/redis-emitter";
import { IRedisClientConnectionManager } from "@fluidframework/server-services-utils";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

export class RedisEventEmitter extends TypedEventEmitter<ICollaborationSessionEvents> {
	private readonly redisEmitter: RedisEmitter;

	constructor(redisClientConnectionManager: IRedisClientConnectionManager) {
		super();
		this.redisEmitter = new RedisEmitter(redisClientConnectionManager.getRedisClient());

		redisClientConnectionManager.addErrorHandler(
			undefined, // lumber properties
			"Error with RedisEventEmitter", // error message
			(error) => {
				this.emit("error", error);
				return false;
			},
		);
	}

	public async emitToRoom(room: string, event: string, ...args: any[]): Promise<void> {
		try {
			// Emit event locally
			Lumberjack.info(`Emitting locally`, { event, room });
			this.emit(event, ...args);
			// Emit event to other nexus instances
			Lumberjack.info(`Emitting to all nexus isntances`, { event, room });
			this.redisEmitter.to(room).emit("signal", ...args);
			Lumberjack.info(`Notification bradcasting complete`, { event, room });
		} catch (error) {
			Lumberjack.error(`Error emitting to room`, { room, event }, error);
			throw error;
		}
	}
}
