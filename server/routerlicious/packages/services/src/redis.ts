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
			winston.warn("A prefix for RedisCache was not included in the parameters.");
			Lumberjack.warning("A prefix for RedisCache was not included in the parameters.");
		}

		client.on("error", (err) => {
			winston.error("Error with Redis:", err);
			Lumberjack.error("Error with Redis", undefined, err);
		});
	}

	public async delete(key: string, appendPrefixToKey: boolean = true): Promise<boolean> {
		// If 'appendPrefixToKey' is true, we prepend a prefix to the 'key' parameter.
		// This is useful in scenarios where we want to consistently manage keys with a common prefix,
		// If 'appendPrefixToKey' is false, we assume that the 'key' parameter with prefix is already passed in by the caller,
		// and no additional prefix needs to be added.
		try {
			const keyToDelete: string = appendPrefixToKey ? this.getKey(key) : key;
			const result = await this.client.del(keyToDelete);
			return result === 1;
		} catch (error) {
			Lumberjack.error(`Error deleting from cache.`, undefined, error);
			return false;
		}
	}

	public async get<T>(key: string): Promise<T> {
		const stringValue: string = await this.client.get(this.getKey(key));
		return JSON.parse(stringValue) as T;
	}

	public async set<T>(
		key: string,
		value: T,
		expireAfterSeconds: number = this.expireAfterSeconds,
	): Promise<void> {
		const result = await this.client.set(
			this.getKey(key),
			JSON.stringify(value),
			"EX",
			expireAfterSeconds,
		);
		if (result !== "OK") {
			throw new Error(result);
		}
	}

	public async incr(key: string): Promise<number> {
		try {
			return this.client.incr(key);
		} catch (error) {
			Lumberjack.error(
				`Error while incrementing counter for ${key} in redis.`,
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
		const result: string[] = await this.client.keys(`${this.getKey(keyPrefix)}*`);
		return result;
	}

	public async decr(key: string): Promise<number> {
		try {
			return this.client.decr(key);
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
	 * Translates the input key to the one we will actually store in redis
	 */
	private getKey(key: string): string {
		return `${this.prefix}:${key}`;
	}
}
