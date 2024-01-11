/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRedisParameters } from "@fluidframework/server-services-utils";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import * as IoRedis from "ioredis";

export const debug = (msg: string) => {
	process.stdout.write(`${msg}\n`);
};

export interface RedisParams {
	enableHashmapRedisFs: boolean;
	expireAfterSeconds: number;
}

export interface IRedis {
	get<T>(key: string): Promise<T>;
	set<T>(key: string, value: T, expireAfterSeconds?: number): Promise<void>;
	del(key: string, appendPrefixToKey?: boolean): Promise<boolean>;
	delAll(keyPrefix: string): Promise<boolean>;
	keysByPrefix(keyPrefix: string): Promise<string[]>;
}

export class Redis implements IRedis {
	private readonly expireAfterSeconds: number = 60 * 60 * 24;
	private readonly prefix: string = "fs";

	constructor(
		private readonly client: IoRedis.default,
		parameters?: IRedisParameters,
	) {
		if (parameters?.expireAfterSeconds) {
			this.expireAfterSeconds = parameters.expireAfterSeconds;
		}

		if (parameters?.prefix) {
			this.prefix = parameters.prefix;
		}

		client.on("error", (error) => {
			Lumberjack.error("Redis Cache Error", undefined, error);
		});
	}

	public async get<T>(key: string): Promise<T> {
		const stringValue = await this.client.get(this.getKey(key));
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

	public async del(key: string, appendPrefixToKey = true): Promise<boolean> {
		// If 'appendPrefixToKey' is true, we prepend a prefix to the 'key' parameter.
		// This is useful in scenarios where we want to consistently manage keys with a common prefix,
		// If 'appendPrefixToKey' is false, we assume that the 'key' parameter with prefix is already passed in by the caller,
		// and no additional prefix needs to be added.
		const keyToDelete = appendPrefixToKey ? this.getKey(key) : key;
		const result = await this.client.del(keyToDelete);
		// The DEL API in Redis returns the number of keys that were removed.
		// We always call Redis DEL with one key only, so we expect a result equal to 1
		// to indicate that the key was removed. 0 would indicate that the key does not exist.
		return result === 1;
	}

	public async delAll(keyPrefix: string): Promise<boolean> {
		const keys = await this.keysByPrefix(keyPrefix);
		if (keys.length === 0) {
			return false;
		}
		const result = await this.client.del(...keys);
		return result === keys.length;
	}

	public async keysByPrefix(keyPrefix: string): Promise<string[]> {
		const result = await this.client.keys(`${this.getKey(keyPrefix)}*`);
		return result;
	}

	/**
	 * Translates the input key to the one we will actually store in redis
	 */
	private getKey(key: string): string {
		return `${this.prefix}:${key}`;
	}
}

export class HashMapRedis implements IRedis {
	private readonly expireAfterSeconds: number = 60 * 60 * 24;
	private readonly prefix: string = "fs";

	constructor(
		private readonly mapKey: string,
		private readonly client: IoRedis.default,
		parameters?: IRedisParameters,
	) {
		if (parameters?.expireAfterSeconds) {
			this.expireAfterSeconds = parameters.expireAfterSeconds;
		}

		if (parameters?.prefix) {
			this.prefix = parameters.prefix;
		}

		client.on("error", (error) => {
			Lumberjack.error("Redis Cache Error", undefined, error);
		});
	}

	public async get<T>(key: string): Promise<T> {
		if (!this.getMapPropertyKey(key) || this.mapKey.startsWith(key)) {
			// This is a readDir for part of the root directory, so we don't need to get anything in the hash map
			return "" as unknown as T;
		}
		const stringValue = await this.client.hget(this.getMapKey(), this.getMapPropertyKey(key));
		return JSON.parse(stringValue) as T;
	}

	public async set<T>(
		key: string,
		value: T,
		expireAfterSeconds: number = this.expireAfterSeconds,
	): Promise<void> {
		if (!this.getMapPropertyKey(key) || (!value && this.mapKey.startsWith(key))) {
			// This is a createDirectory for the root directory, so we don't need to set anything in the hash map
			return;
		}
		// Set values in the hash map and returns the count of set key/value pairs.
		// However, if it's a duplicate key, it will return 0, so we can't rely on the return value to determine success.
		await this.client.hset(
			this.getMapKey(),
			this.getMapPropertyKey(key),
			JSON.stringify(value),
		);
		// Update the expiration time for the hash map
		await this.client.expire(this.getMapKey(), expireAfterSeconds);
	}

	public async del(key: string): Promise<boolean> {
		if (this.mapKey.startsWith(key)) {
			return this.delAll();
		}
		const result = await this.client.hdel(this.getMapKey(), this.getMapPropertyKey(key));
		// The HDEL API in Redis returns the number of keys that were removed.
		// We always call Redis HDEL with one key only, so we expect a result equal to 1
		// to indicate that the key was removed. 0 would indicate that the key does not exist.
		return result === 1;
	}

	public async delAll(): Promise<boolean> {
		const result = await this.client.del(this.getMapKey());
		// The DEL API in Redis returns the number of keys that were removed.
		// We always call Redis DEL with one key only, so we expect a result equal to 1
		// to indicate that the key was removed. 0 would indicate that the key does not exist.
		return result === 1;
	}

	public async keysByPrefix(keyPrefix: string): Promise<string[]> {
		const result = await this.client.hkeys(this.getMapKey());
		return result.filter((key) => key.startsWith(keyPrefix));
	}

	/**
	 * Translates the input key to the one we will actually store in redis
	 */
	private getMapKey(): string {
		return `${this.prefix}:${this.mapKey}`;
	}

	/**
	 * Translates the input key to the one we will actually store in redis
	 */
	private getMapPropertyKey(key: string): string {
		return `${key}`.replace(this.mapKey, "");
	}
}
