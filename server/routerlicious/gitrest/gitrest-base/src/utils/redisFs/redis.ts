/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { runWithRetry } from "@fluidframework/server-services-core";
import {
	IRedisParameters,
	IRedisClientConnectionManager,
} from "@fluidframework/server-services-utils";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { RedisFsApis, executeRedisFsApiWithMetric } from "./helpers";

export interface RedisParams extends IRedisParameters {
	enableHashmapRedisFs: boolean;
	enableRedisMetrics: boolean;
	redisApiMetricsSamplingPeriod: number;
}

export interface IRedis {
	/**
	 * Get the value stored at the given key.
	 */
	get<T>(key: string): Promise<T | undefined>;
	/**
	 * Store the given value the given key.
	 */
	set<T>(key: string, value: T, expireAfterSeconds?: number): Promise<void>;
	/**
	 * Store the given key/value pairs.
	 */
	setMany<T>(
		keyValuePairs: { key: string; value: T }[],
		expireAfterSeconds?: number,
	): Promise<void>;
	/**
	 * Check the existence of the given key.
	 * @returns the size of the value stored at the given key. -1 if the key does not exist, 0 if the key is empty.
	 */
	peek(key: string): Promise<number>;
	/**
	 * Delete the given key. Optionally, append a prefix to the key before deleting.
	 */
	del(key: string, appendPrefixToKey?: boolean): Promise<boolean>;
	/**
	 * Delete all keys with the given prefix.
	 */
	delAll(keyPrefix: string): Promise<boolean>;
	/**
	 * Retrieve all keys with the given prefix.
	 */
	keysByPrefix(keyPrefix: string): Promise<string[]>;
}

export class Redis implements IRedis {
	private readonly expireAfterSeconds: number = 60 * 60 * 24;
	private readonly prefix: string = "fs";

	constructor(
		private readonly redisClientConnectionManager: IRedisClientConnectionManager,
		private readonly parameters?: RedisParams,
	) {
		if (parameters?.expireAfterSeconds) {
			this.expireAfterSeconds = parameters.expireAfterSeconds;
		}

		if (parameters?.prefix) {
			this.prefix = parameters.prefix;
		}

		redisClientConnectionManager.addErrorHandler(undefined, "Redis Cache Error");
	}

	public async get<T>(key: string): Promise<T | undefined> {
		const stringValue = await this.redisClientConnectionManager
			.getRedisClient()
			.get(this.getKey(key));
		if (!stringValue) {
			// Cannot JSON parse an empty string or null value, so return undefined.
			return undefined;
		}
		return JSON.parse(stringValue) as T;
	}

	public async set<T>(
		key: string,
		value: T,
		expireAfterSeconds: number = this.expireAfterSeconds,
	): Promise<void> {
		const result = await this.redisClientConnectionManager
			.getRedisClient()
			.set(this.getKey(key), JSON.stringify(value), "EX", expireAfterSeconds);

		if (result !== "OK") {
			throw new Error(result);
		}
	}

	public async setMany<T>(
		keyValuePairs: { key: string; value: T }[],
		expireAfterSeconds: number = this.expireAfterSeconds,
	): Promise<void> {
		const setPs = keyValuePairs.map(async ({ key, value }) =>
			this.set(key, value, expireAfterSeconds),
		);
		await Promise.all(setPs);
	}

	public async peek(key: string): Promise<number> {
		const strlen = await this.redisClientConnectionManager
			.getRedisClient()
			.strlen(this.getKey(key));
		// If the key does not exist, strlen will return 0.
		// Otherwise, we are stringifying everything we store in Redis, so strlen will always be at least 2 from the stringified quotes.
		return strlen === 0 ? -1 : strlen - 2;
	}

	public async del(key: string, appendPrefixToKey = true): Promise<boolean> {
		// If 'appendPrefixToKey' is true, we prepend a prefix to the 'key' parameter.
		// This is useful in scenarios where we want to consistently manage keys with a common prefix,
		// If 'appendPrefixToKey' is false, we assume that the 'key' parameter with prefix is already passed in by the caller,
		// and no additional prefix needs to be added.
		const keyToDelete = appendPrefixToKey ? this.getKey(key) : key;
		const result = await this.redisClientConnectionManager.getRedisClient().unlink(keyToDelete);
		// The UNLINK API in Redis returns the number of keys that were removed.
		// We always call Redis DEL with one key only, so we expect a result equal to 1
		// to indicate that the key was removed. 0 would indicate that the key does not exist.
		return result === 1;
	}

	public async delAll(keyPrefix: string): Promise<boolean> {
		const keys = await this.keysByPrefix(keyPrefix);
		if (keys.length === 0) {
			return false;
		}
		const result = await this.redisClientConnectionManager
			.getRedisClient()
			.unlink(...keys.map((key) => this.getKey(key)));
		return result === keys.length;
	}

	public async keysByPrefix(keyPrefix: string): Promise<string[]> {
		const result = await executeRedisFsApiWithMetric(
			async () =>
				this.redisClientConnectionManager
					.getRedisClient()
					.keys(`${this.getKey(keyPrefix)}*`),
			RedisFsApis.KeysByPrefix,
			this.parameters?.enableRedisMetrics ?? false,
			this.parameters?.redisApiMetricsSamplingPeriod,
			{
				keyPrefix,
			},
		);
		// Remove the prefix from the keys before returning them.
		return result.map((key) => key.replace(`${this.prefix}:`, ""));
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
	private initialized: boolean = false;

	constructor(
		/**
		 * Key that points to the HashMap in Redis.
		 */
		private readonly hashMapKey: string,
		private readonly redisClientConnectionManager: IRedisClientConnectionManager,
		private readonly parameters?: RedisParams,
	) {
		if (parameters?.expireAfterSeconds) {
			this.expireAfterSeconds = parameters.expireAfterSeconds;
		}

		if (parameters?.prefix) {
			this.prefix = parameters.prefix;
		}

		redisClientConnectionManager.addErrorHandler(undefined, "Redis Cache Error");
	}

	public async get<T>(field: string): Promise<T | undefined> {
		if (this.isFieldRootDirectory(field)) {
			// Field is part of the root hashmap key, so return empty string.
			return "" as unknown as T;
		}
		const stringValue = await this.redisClientConnectionManager
			.getRedisClient()
			.hget(this.getMapKey(), this.getMapField(field));
		if (!stringValue) {
			// Cannot JSON parse an empty string or null value, so return undefined.
			return undefined;
		}
		return JSON.parse(stringValue) as T;
	}

	public async set<T>(
		field: string,
		value: T,
		expireAfterSeconds: number = this.expireAfterSeconds,
	): Promise<void> {
		await this.initHashmap();
		if (this.isFieldRootDirectory(field)) {
			// Field is part of the root hashmap key, so do nothing.
			return;
		}
		// Set values in the hash map and returns the count of set field/value pairs.
		// However, if it's a duplicate field, it will return 0, so we can't rely on the return value to determine success.
		await this.redisClientConnectionManager
			.getRedisClient()
			.hset(this.getMapKey(), this.getMapField(field), JSON.stringify(value));
	}

	public async setMany<T>(
		fieldValuePairs: { key: string; value: T }[],
		expireAfterSeconds: number = this.expireAfterSeconds,
	): Promise<void> {
		await this.initHashmap();
		// Filter out root directory fields, since they are not necessary fields in the HashMap.
		// Then, map each field/value pair to array of arguments for the HSET command (f1, v1, f2, v2...).
		const fieldValueArgs = fieldValuePairs
			.filter(({ key: field, value }) => !this.isFieldRootDirectory(field))
			.flatMap(({ key: field, value }) => [this.getMapField(field), JSON.stringify(value)]);
		if (fieldValueArgs.length === 0) {
			// Don't do anything if there are no fields to set.
			return;
		}
		// Set values in the hash map and returns the count of set field/value pairs.
		// However, if it's a duplicate field, it will return 0, so we can't rely on the return value to determine success.
		await this.redisClientConnectionManager
			.getRedisClient()
			.hset(this.getMapKey(), ...fieldValueArgs);
	}

	public async peek(field: string): Promise<number> {
		if (this.isFieldRootDirectory(field)) {
			// Field is part of the root hashmap key, so it exists but is empty.
			return 0;
		}
		const strlen = await this.redisClientConnectionManager
			.getRedisClient()
			.hstrlen(this.getMapKey(), this.getMapField(field));
		// If the key does not exist, strlen will return 0.
		// Otherwise, we are stringifying everything we store in Redis, so strlen will always be at least 2 from the stringified quotes.
		return strlen === 0 ? -1 : strlen - 2;
	}

	public async del(field: string): Promise<boolean> {
		if (this.isFieldRootDirectory(field)) {
			// The deleted field is a root directory, so we need to delete the whole HashMap.
			return this.delAll(field);
		}
		const result = await this.redisClientConnectionManager
			.getRedisClient()
			.hdel(this.getMapKey(), this.getMapField(field));
		// The HDEL API in Redis returns the number of keys that were removed.
		// We always call Redis HDEL with one key only, so we expect a result equal to 1
		// to indicate that the key was removed. 0 would indicate that the key does not exist.
		return result === 1;
	}

	public async delAll(keyPrefix: string): Promise<boolean> {
		if (this.isFieldRootDirectory(keyPrefix)) {
			// The key prefix matches a root directory, so we need to delete the whole HashMap.
			const unlinkResult = await this.redisClientConnectionManager
				.getRedisClient()
				.unlink(this.getMapKey());
			// The UNLINK API in Redis returns the number of keys that were removed.
			// We always call Redis DEL with one key only, so we expect a result equal to 1
			// to indicate that the key was removed. 0 would indicate that the key does not exist.
			return unlinkResult === 1;
		}
		const keys = await this.keysByPrefix(keyPrefix);
		if (keys.length === 0) {
			return false;
		}
		const hDelResult = await this.redisClientConnectionManager
			.getRedisClient()
			.hdel(this.getMapKey(), ...keys);
		return hDelResult === keys.length;
	}

	public async keysByPrefix(keyPrefix: string): Promise<string[]> {
		const result = await executeRedisFsApiWithMetric(
			async () => this.redisClientConnectionManager.getRedisClient().hkeys(this.getMapKey()),
			RedisFsApis.HKeysByPrefix,
			this.parameters?.enableRedisMetrics ?? false,
			this.parameters?.redisApiMetricsSamplingPeriod,
			{
				keyPrefix,
			},
		);
		return result.filter((field) => field.startsWith(keyPrefix));
	}

	/**
	 * Translates the input hashMapKey to the one we will actually store in redis.
	 */
	private getMapKey(): string {
		return `${this.prefix}:${this.hashMapKey}`;
	}

	/**
	 * Translates the input field to the one we will actually store in redis within the HashMap.
	 */
	private getMapField(field: string): string {
		return `${field}`.replace(this.hashMapKey, "");
	}

	/**
	 * Initializes the hashmap if it doesn't exist, and sets the expiration on the hashmap key.
	 * This is a no-op if it has already been called once in this HashMapRedis instance.
	 */
	private async initHashmap(): Promise<void> {
		if (this.initialized) {
			// only initialize once
			return;
		}
		const initializeHashMapIfNotExists = async (): Promise<void> => {
			const exists = await this.redisClientConnectionManager
				.getRedisClient()
				.exists(this.getMapKey());
			if (!exists) {
				await executeRedisFsApiWithMetric(
					async () => {
						// Set a blank field/value pair to initialize the hashmap.
						await this.redisClientConnectionManager
							.getRedisClient()
							.hset(this.getMapKey(), "", "");
						await this.redisClientConnectionManager
							.getRedisClient()
							.expire(this.getMapKey(), this.expireAfterSeconds);
					},
					RedisFsApis.InitHashmapFs,
					this.parameters?.enableRedisMetrics ?? false,
					this.parameters?.redisApiMetricsSamplingPeriod,
				);
			}
			this.initialized = true;
		};
		// Setting expiration on the hashmap key is vital, so we should retry it on failure
		runWithRetry(
			async () => initializeHashMapIfNotExists(),
			"InitializeRedisFsHashMap",
			3,
			1000,
		).catch((error) => {
			Lumberjack.error("Failed to initialize hashmap with expiration", undefined, error);
		});
	}

	/**
	 * Checks if the provided field is a root directory field contained in the hashmap key.
	 */
	private isFieldRootDirectory(field: string): boolean {
		return this.hashMapKey.startsWith(field);
	}
}
