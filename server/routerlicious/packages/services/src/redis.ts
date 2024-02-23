/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICache } from "@fluidframework/server-services-core";
import { IRedisParameters } from "@fluidframework/server-services-utils";
import * as Redis from "ioredis";
import * as winston from "winston";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

/**
 * Redis based cache client
 * @internal
 */
export class RedisCache implements ICache {
	private readonly expireAfterSeconds: number = 60 * 60 * 24;
	private readonly prefix: string = "page";
	constructor(
		private readonly client: Redis.default | Redis.Cluster,
		parameters?: IRedisParameters,
	) {
		if (parameters?.expireAfterSeconds) {
			this.expireAfterSeconds = parameters.expireAfterSeconds;
		}

		if (parameters?.prefix) {
			this.prefix = parameters.prefix;
		}

		client.on("error", (err) => {
			winston.error("Error with Redis:", err);
			Lumberjack.error("Error with Redis", undefined, err);
		});
	}
	public async delete(key: string): Promise<boolean> {
		try {
			await this.client.del(this.getKey(key));
			return true;
		} catch (error: any) {
			const newError: Error = { name: error?.name, message: error?.message };
			Lumberjack.error(`Error deleting from cache.`, undefined, newError);
			return false;
		}
	}

	public async get(key: string): Promise<string> {
		try {
			return this.client.get(this.getKey(key));
		} catch (error: any) {
			const newError: Error = { name: error?.name, message: error?.message };
			Lumberjack.error(
				`Error getting ${key.substring(0, 20)} from cache.`,
				undefined,
				newError,
			);
			throw newError;
		}
	}

	public async set(key: string, value: string, expireAfterSeconds?: number): Promise<void> {
		try {
			const result = await this.client.set(
				this.getKey(key),
				value,
				"EX",
				expireAfterSeconds ?? this.expireAfterSeconds,
			);
			if (result !== "OK") {
				throw new Error(result);
			}
		} catch (error: any) {
			const newError: Error = { name: error?.name, message: error?.message };
			Lumberjack.error(
				`Error setting ${key.substring(0, 20)} in cache.`,
				undefined,
				newError,
			);
			throw newError;
		}
	}

	public async incr(key: string): Promise<number> {
		try {
			return this.client.incr(key);
		} catch (error: any) {
			const newError: Error = { name: error?.name, message: error?.message };
			Lumberjack.error(
				`Error while incrementing counter for ${key.substring(0, 20)} in redis.`,
				undefined,
				newError,
			);
			throw newError;
		}
	}

	public async decr(key: string): Promise<number> {
		try {
			return this.client.decr(key);
		} catch (error: any) {
			const newError: Error = { name: error?.name, message: error?.message };
			Lumberjack.error(
				`Error while decrementing counter for ${key.substring(0, 20)} in redis.`,
				undefined,
				newError,
			);
			throw newError;
		}
	}

	/**
	 * Translates the input key to the one we will actually store in redis
	 */
	private getKey(key: string): string {
		return `${this.prefix}:${key}`;
	}
}
