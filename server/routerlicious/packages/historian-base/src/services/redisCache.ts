/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IRedisParameters,
	IRedisClientConnectionManager,
} from "@fluidframework/server-services-utils";
import { ICache } from "./definitions";

/**
 * Redis based cache client
 */
export class RedisCache implements ICache {
	private readonly expireAfterSeconds: number = 60 * 60 * 24;
	private readonly prefix: string = "git";

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

		redisClientConnectionManager.addErrorHandler(undefined, "Redis Cache Error");
	}

	public async get<T>(key: string): Promise<T | null> {
		const stringValue = await this.redisClientConnectionManager
			.getRedisClient()
			.get(this.getKey(key));
		if (stringValue === null) {
			return null;
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

	public async delete(key: string): Promise<boolean> {
		const result = await this.redisClientConnectionManager
			.getRedisClient()
			.del(this.getKey(key));
		// The DEL API in Redis returns the number of keys that were removed.
		// We always call Redis DEL with one key only, so we expect a result equal to 1
		// to indicate that the key was removed. 0 would indicate that the key does not exist.
		return result === 1;
	}

	/**
	 * Translates the input key to the one we will actually store in redis
	 */
	private getKey(key: string): string {
		return `${this.prefix}:${key}`;
	}
}
