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
		this.redisClientConnectionForSub
			.getRedisClient()
			.on("message", (channel: string, message: string) => {
				if (channel === event) {
					const data: IBroadcastSignalEventPayload = JSON.parse(message);
					callback(data);
				}
			});
		try {
			await this.redisClientConnectionForSub
				.getRedisClient()
				.subscribe(event, (error, count) => {
					// TODO: Add error handling if parsing fails
					if (error) {
						Lumberjack.error(`Error subscribing to event`, { event, count }, error);
						return;
					}
				});
			this.activeSubscriptions.add(event);
			Lumberjack.info(`Subscribed to event`, { event });
		} catch (error) {
			Lumberjack.error(`Error subscribing to event`, { event }, error);
			throw error;
		}
	}

	public async publish(event: string, ...args: any[]): Promise<void> {
		try {
			const payload = args[0] as IBroadcastSignalEventPayload;
			Lumberjack.info(`Emitting to all nexus isntances`, { event });
			await this.redisClientConnectionForPub
				.getRedisClient()
				.publish(event, JSON.stringify(payload));
			Lumberjack.info(`Notification bradcasting complete`, { event });
		} catch (error) {
			Lumberjack.error(`Error emitting to room`, { event }, error);
			throw error;
		}
	}

	public async dispose(listener: (...args: any[]) => void): Promise<void> {
		const redisSub = this.redisClientConnectionForSub.getRedisClient();
		for (const event of this.activeSubscriptions) {
			// TODO: Add error handling if testing succeeds
			await redisSub.unsubscribe(event);
		}
		redisSub.off("message", listener);
		this.activeSubscriptions.clear();

		Lumberjack.info(`RedisEventEmitter disposed, all subscriptions removed`);
	}
}
