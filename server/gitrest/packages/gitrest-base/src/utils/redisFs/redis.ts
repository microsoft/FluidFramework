/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRedisParameters } from "@fluidframework/server-services-utils";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import * as IoRedis from "ioredis";
import { getRandomInt } from "@fluidframework/server-services-client";
import sizeof from "object-sizeof";

export interface RedisParams extends IRedisParameters {
	enableHashmapRedisFs: boolean;
	enableRedisMetrics: boolean;
	redisApiMetricsSamplingPeriod: number;
}

export interface IRedis {
	get<T>(key: string): Promise<T>;
	set<T>(key: string, value: T, expireAfterSeconds?: number): Promise<void>;
	setMany<T>(
		keyValuePairs: { key: string; value: T }[],
		expireAfterSeconds?: number,
	): Promise<void>;
	del(key: string, appendPrefixToKey?: boolean): Promise<boolean>;
	delAll(keyPrefix: string): Promise<boolean>;
	keysByPrefix(keyPrefix: string): Promise<string[]>;
}

export class Redis implements IRedis {
	private readonly expireAfterSeconds: number = 60 * 60 * 24;
	private readonly prefix: string = "fs";

	constructor(
		private readonly client: IoRedis.default,
		private readonly parameters?: RedisParams,
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

	public async setMany<T>(
		keyValuePairs: { key: string; value: T }[],
		expireAfterSeconds: number = this.expireAfterSeconds,
	): Promise<void> {
		const setPs = keyValuePairs.map(async ({ key, value }) =>
			this.set(key, value, expireAfterSeconds),
		);
		await Promise.all(setPs);
	}

	public async del(key: string, appendPrefixToKey = true): Promise<boolean> {
		// If 'appendPrefixToKey' is true, we prepend a prefix to the 'key' parameter.
		// This is useful in scenarios where we want to consistently manage keys with a common prefix,
		// If 'appendPrefixToKey' is false, we assume that the 'key' parameter with prefix is already passed in by the caller,
		// and no additional prefix needs to be added.
		const keyToDelete = appendPrefixToKey ? this.getKey(key) : key;
		const result = await this.client.unlink(keyToDelete);
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
		const result = await executeRedisApi(
			async () => this.client.keys(`${this.getKey(keyPrefix)}*`),
			RedisApis.keysByPrefix,
			RedisConstants.RedisApi,
			this.parameters?.enableRedisMetrics,
			this.parameters?.redisApiMetricsSamplingPeriod,
		);
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
		/**
		 * Key that points to the HashMap in Redis.
		 */
		private readonly hashMapKey: string,
		private readonly client: IoRedis.default,
		private readonly parameters?: RedisParams,
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

	public async get<T>(field: string): Promise<T> {
		const stringValue = await this.client.hget(this.getMapKey(), this.getMapField(field));
		return JSON.parse(stringValue) as T;
	}

	public async set<T>(
		field: string,
		value: T,
		expireAfterSeconds: number = this.expireAfterSeconds,
	): Promise<void> {
		// Set values in the hash map and returns the count of set field/value pairs.
		// However, if it's a duplicate field, it will return 0, so we can't rely on the return value to determine success.
		await this.client.hset(this.getMapKey(), this.getMapField(field), JSON.stringify(value));
		this.updateHashMapExpiration([field], expireAfterSeconds);
	}

	public async setMany<T>(
		fieldValuePairs: { key: string; value: T }[],
		expireAfterSeconds: number = this.expireAfterSeconds,
	): Promise<void> {
		// Set values in the hash map and returns the count of set field/value pairs.
		// However, if it's a duplicate field, it will return 0, so we can't rely on the return value to determine success.
		await this.client.hset(
			this.getMapKey(),
			...fieldValuePairs.flatMap(({ key: field, value }) => [
				this.getMapField(field),
				JSON.stringify(value),
			]),
		);
		this.updateHashMapExpiration(
			fieldValuePairs.map(({ key: field }) => field),
			expireAfterSeconds,
		);
	}

	public async del(field: string): Promise<boolean> {
		if (this.hashMapKey.startsWith(field)) {
			// The deleted field is a root directory, so we need to delete the whole HashMap.
			return this.delAll(field);
		}
		const result = await this.client.hdel(this.getMapKey(), this.getMapField(field));
		// The HDEL API in Redis returns the number of keys that were removed.
		// We always call Redis HDEL with one key only, so we expect a result equal to 1
		// to indicate that the key was removed. 0 would indicate that the key does not exist.
		return result === 1;
	}

	public async delAll(keyPrefix: string): Promise<boolean> {
		if (this.hashMapKey.startsWith(keyPrefix)) {
			// The key prefix matches a root directory, so we need to delete the whole HashMap.
			const unlinkResult = await this.client.unlink(this.getMapKey());
			// The DEL API in Redis returns the number of keys that were removed.
			// We always call Redis DEL with one key only, so we expect a result equal to 1
			// to indicate that the key was removed. 0 would indicate that the key does not exist.
			return unlinkResult === 1;
		}
		const keys = await this.keysByPrefix(keyPrefix);
		if (keys.length === 0) {
			return false;
		}
		const hDelResult = await this.client.hdel(this.getMapKey(), ...keys);
		return hDelResult === keys.length;
	}

	public async keysByPrefix(keyPrefix: string): Promise<string[]> {
		const result = await executeRedisApi(
			async () => this.client.hkeys(this.getMapKey()),
			RedisApis.hkeys,
			RedisConstants.RedisApi,
			this.parameters?.enableRedisMetrics,
			this.parameters?.redisApiMetricsSamplingPeriod,
		);
		return result.filter((field) => `${this.getMapKey()}/${field}`.startsWith(keyPrefix));
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
	 * Asynchronously updates the HashMap key's expiration time when the field matching mapKey is set.
	 */
	private updateHashMapExpiration(
		fields: string[],
		expireAfterSeconds: number = this.expireAfterSeconds,
	) {
		if (new Set(fields).has(this.hashMapKey)) {
			// We need to set the expiration of the HashMap key such that it is deleted after the correct expiration time.
			// However, we only want to do this _once_, so we set the expiration when the field matching the hashmap key is set.
			// This means that the expiration will be set when the repository directory is created, then never again.
			this.client.expire(this.getMapKey(), expireAfterSeconds).catch((error) => {
				Lumberjack.error("Failed to set initial map key with expiration", undefined, error);
			});
		}
	}
}

enum RedisApis {
	keysByPrefix = "keysByPrefix",
	hkeys = "hkeys",
}

enum RedisConstants {
	RedisApi = "RedisApi",
}

export async function executeRedisApi<T>(
	api: () => Promise<T>,
	apiName: string,
	metricName: string,
	metricEnabled: boolean = false,
	samplingPeriod: number = 0,
	telemetryProperties?: Record<string, any>,
	logResponseSize: boolean = false,
): Promise<T> {
	if (!metricEnabled || (samplingPeriod && getRandomInt(samplingPeriod) !== 0)) {
		return api();
	}

	const metric = Lumberjack.newLumberMetric(metricName, telemetryProperties);
	try {
		let responseSize;
		const result = await api();
		if (logResponseSize) {
			responseSize = sizeof(result);
		}
		metric.setProperty("responseSize", responseSize);
		metric.success(`${metricName}: ${apiName} success`);
		return result;
	} catch (error: any) {
		metric.error(`${metricName}: ${apiName} error`, error);
		throw error;
	}
}
