/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IRedisClientConnectionManager } from "@fluidframework/server-services-utils";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import type { IBroadcastSignalEventPayload, ICollaborationSessionEvents } from "./interfaces";

export class RedisEventEmitter extends TypedEventEmitter<ICollaborationSessionEvents> {
	private readonly activeSubscriptions: Set<string> = new Set();
	constructor(
		private readonly redisClientConnectionForPub: IRedisClientConnectionManager,
		private readonly redisClientConnectionForSub: IRedisClientConnectionManager,
	) {
		super();
		// this.redisEmitter = new RedisEmitter(redisClientConnectionManager.getRedisClient());
		redisClientConnectionForPub.addErrorHandler(
			undefined, // lumber properties
			"Error with RedisEventEmitter connection for pub", // error message
			(error) => {
				this.emit("error", error);
				return false;
			},
		);

		redisClientConnectionForSub.addErrorHandler(
			undefined, // lumber properties
			"Error with RedisEventEmitter connection for sub", // error message
			(error) => {
				this.emit("error", error);
				return false;
			},
		);
	}

	public async subscribe(event: string, callback: (...args: any[]) => void): Promise<void> {
		await this.redisClientConnectionForSub
			.getRedisClient()
			.subscribe(event, (error, message) => {
				if (error) {
					// TODO: Add error handling if testing succeeds
					Lumberjack.error(`Error subscribing to event`, { event }, error);
					return;
				}
				// TODO: Add error handling if parsing fails
				const stringMessage = JSON.stringify(message);
				const data: IBroadcastSignalEventPayload = JSON.parse(stringMessage);
				callback(data);
				// this.emit(event, data);
			});
		this.activeSubscriptions.add(event);
		Lumberjack.info(`Subscribed to event`, { event });
	}

	public async publishToRoom(room: string, event: string, ...args: any[]): Promise<void> {
		try {
			Lumberjack.info(`Emitting to all nexus isntances`, { event, room });
			await this.redisClientConnectionForPub
				.getRedisClient()
				.publish(room, JSON.stringify({ event, args }));
			Lumberjack.info(`Notification bradcasting complete`, { event, room });
		} catch (error) {
			Lumberjack.error(`Error emitting to room`, { room, event }, error);
			throw error;
		}
	}

	public async dispose(): Promise<void> {
		const redisSub = this.redisClientConnectionForSub.getRedisClient();
		for (const event of this.activeSubscriptions) {
			// TODO: Add error handling if testing succeeds
			await redisSub.unsubscribe(event);
		}
		this.activeSubscriptions.clear();

		Lumberjack.info(`RedisEventEmitter disposed, all subscriptions removed`);
	}
}
