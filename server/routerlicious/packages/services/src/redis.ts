/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICache } from "@fluidframework/server-services-core";
import { IRedisParameters } from "@fluidframework/server-services-utils";
import * as Redis from "ioredis";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

/**
 * Redis based cache client
 */
export class RedisCache implements ICache {
	private readonly expireAfterSeconds: number = 60 * 60 * 24;
	private readonly prefix: string;

	constructor(private readonly client: Redis.default, parameters?: IRedisParameters) {
		if (parameters?.expireAfterSeconds) {
			this.expireAfterSeconds = parameters.expireAfterSeconds;
		}

		if (parameters?.prefix) {
			this.prefix = parameters.prefix;
		} else {
			this.prefix = "";
			Lumberjack.warning("A prefix for RedisCache was not included in the parameters.");
		}

		client.on("error", (err) => {
			Lumberjack.error("Error with Redis", undefined, err);
		});
	}

	public async get<T>(key: string, prefixOverride?: string): Promise<T> {
		let stringValue: string = await this.client.get(this.getKey(key, prefixOverride));
		if (typeof(stringValue) !== "string") {
			// This is for backwards compat, incase a non-string value was previously stored in redis
			stringValue = JSON.stringify(stringValue);
		}
		return JSON.parse(stringValue) as T;
	}

	public async set<T>(
		key: string,
		value: T,
		expireAfterSeconds: number = this.expireAfterSeconds,
		prefixOverride?: string,
	): Promise<void> {
		const result = await this.client.set(
			this.getKey(key, prefixOverride),
			JSON.stringify(value),
			"EX",
			expireAfterSeconds,
		);
		if (result !== "OK") {
			throw new Error(result);
		}
	}

	public async delete(key: string, prefixOverride?: string): Promise<boolean> {
		try {
			const keyToDelete: string = this.getKey(key, prefixOverride);
			const result = await this.client.del(keyToDelete);
			return result === 1;
		} catch (error) {
			Lumberjack.error(`Error deleting ${key} from cache.`, undefined, error);
			return false;
		}
	}

	public async incr(key: string, prefixOverride?: string): Promise<number> {
		try {
			const incrKey: string = this.getKey(key, prefixOverride);
			return this.client.incr(incrKey);
		} catch (error) {
			Lumberjack.error(
				`Error while incrementing counter for ${key} in redis.`,
				undefined,
				error,
			);
			throw error;
		}
	}

	public async decr(key: string, prefixOverride?: string): Promise<number> {
		try {
			const decrKey: string = this.getKey(key, prefixOverride);
			return this.client.decr(decrKey);
		} catch (error) {
			Lumberjack.error(
				`Error while decrementing counter for ${key} in redis.`,
				undefined,
				error,
			);
			throw error;
		}
	}

	/**
	 * Get a list of keys that have a given prefix.
	 *
	 * @param keyPrefix - Prefix for the keys to get.
	 */
	public async keysByPrefix(keyPrefix: string): Promise<string[]> {
		return this.client.keys(`${this.getKey(keyPrefix)}*`);
	}

	/**
	 * Translates the input key to the one we will actually store in redis
	 *
	 * @param key - The input key
	 * @param prefixOverride - Prefix to append to key. Empty string will not add any prefix to the key.
	 */
	private getKey(key: string, prefixOverride?: string): string {
		const keyPrefix = prefixOverride === undefined ? this.prefix : prefixOverride;
		if (keyPrefix === "") {
			// Empty prefix should not put a colon in front of string
			return key;
		}
		return `${keyPrefix}:${key}`;
	}
}
