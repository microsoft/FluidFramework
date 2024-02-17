/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICache } from "@fluidframework/server-services-core";
import { IRedisParameters } from "@fluidframework/server-services-utils";
import * as winston from "winston";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { IRedisClientConnectionManager } from "@fluidframework/server-services-shared";

/**
 * Redis based cache client
 * @internal
 */
export class RedisCache implements ICache {
	private readonly expireAfterSeconds: number = 60 * 60 * 24;
	private readonly prefix: string = "page";
	constructor(
		private readonly redisClientConnectionManager: IRedisClientConnectionManager,
		parameters?: IRedisParameters,
	) {
		if (parameters?.expireAfterSeconds) {
			this.expireAfterSeconds = parameters.expireAfterSeconds;
		}

		if (parameters?.prefix) {
			this.prefix = parameters.prefix;
		}

		redisClientConnectionManager.getRedisClient().on("error", (err) => {
			winston.error("[DHRUV DEBUG] Error with Redis:", err);
			Lumberjack.error("[DHRUV DEBUG] Error with Redis", undefined, err);
		});
	}
	public async delete(key: string): Promise<boolean> {
		try {
			await this.redisClientConnectionManager.getRedisClient().del(this.getKey(key));
			return true;
		} catch (error) {
			Lumberjack.error(`[DHRUV DEBUG] Error deleting from cache.`, undefined, error);
			return false;
		}
	}

	public async get(key: string): Promise<string> {
		try {
			return this.redisClientConnectionManager.getRedisClient().get(this.getKey(key));
		} catch (error) {
			Lumberjack.error(`[DHRUV DEBUG] Error getting from cache.`, undefined, error);
			throw error;
		}
	}

	public async set(key: string, value: string, expireAfterSeconds?: number): Promise<void> {
		const result = await this.redisClientConnectionManager
			.getRedisClient()
			.set(this.getKey(key), value, "EX", expireAfterSeconds ?? this.expireAfterSeconds);
		if (result !== "OK") {
			throw new Error(result);
		}
	}

	public async incr(key: string): Promise<number> {
		try {
			return this.redisClientConnectionManager.getRedisClient().incr(key);
		} catch (error) {
			Lumberjack.error(
				`[DHRUV DEBUG] Error while incrementing counter for ${key} in redis.`,
				undefined,
				error,
			);
			throw error;
		}
	}

	public async decr(key: string): Promise<number> {
		try {
			return this.redisClientConnectionManager.getRedisClient().decr(key);
		} catch (error) {
			Lumberjack.error(
				`[DHRUV DEBUG] Error while decrementing counter for ${key} in redis.`,
				undefined,
				error,
			);
			throw error;
		}
	}

	/**
	 * Translates the input key to the one we will actually store in redis
	 */
	private getKey(key: string): string {
		return `${this.prefix}:${key}`;
	}
}
