/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRedisParameters } from "@fluidframework/server-services-utils";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import * as IoRedis from "ioredis";

export interface RedisParams {
	expireAfterSeconds: number;
}

export class Redis {
	private readonly expireAfterSeconds: number = 60 * 60 * 24;
	private readonly prefix: string = "fs";

	constructor(private readonly client: IoRedis.default, parameters?: IRedisParameters) {
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

	public async delete(key: string, appendPrefixToKey = true): Promise<boolean> {
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
