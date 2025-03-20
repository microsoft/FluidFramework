/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IRedisParameters,
	IRedisClientConnectionManager,
} from "@fluidframework/server-services-utils";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

/**
 * Redis based cache client for caching and expiring tenants and tokens.
 */
export class RedisTenantCache {
	private readonly expireAfterSeconds: number = 60 * 60 * 24;
	private readonly prefix: string = "tenant";

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

		redisClientConnectionManager.addErrorHandler(undefined, "Redis Tenant Cache Error");
	}

	public async exists(item: string): Promise<boolean> {
		try {
			const result = await this.redisClientConnectionManager
				.getRedisClient()
				.exists(this.getKey(item));
			return result >= 1;
		} catch (error) {
			Lumberjack.error("Redis Tenant Cache error in exists", undefined, error);
			// Calling class also has a catch block
			throw error;
		}
	}

	public async set(
		key: string,
		value: string = "",
		expireAfterSeconds: number = this.expireAfterSeconds,
	): Promise<void> {
		try {
			const result = await this.redisClientConnectionManager
				.getRedisClient()
				.set(this.getKey(key), value, "EX", expireAfterSeconds);
			if (result !== "OK") {
				throw new Error(result);
			}
		} catch (error) {
			Lumberjack.error("Redis Tenant Cache error in set", undefined, error);
			// Calling class also has a catch block
			throw error;
		}
	}

	public async delete(key: string): Promise<boolean> {
		try {
			const result = await this.redisClientConnectionManager
				.getRedisClient()
				.del(this.getKey(key));
			return result === 1;
		} catch (error) {
			Lumberjack.error("Redis Tenant Cache error in delete", undefined, error);
			// Calling class does not have a catch block
			return false;
		}
	}

	public async get(key: string): Promise<string | null> {
		try {
			return await this.redisClientConnectionManager.getRedisClient().get(this.getKey(key));
		} catch (error) {
			Lumberjack.error("Redis Tenant Cache error in get", undefined, error);
			// Calling class also has a catch block
			throw error;
		}
	}

	/**
	 * Translates the input item to the one we will actually store in redis
	 */
	private getKey(item: string): string {
		return `${this.prefix}:${item}`;
	}
}
