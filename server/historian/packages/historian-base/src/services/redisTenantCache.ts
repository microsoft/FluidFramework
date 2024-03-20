/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IRedisParameters,
	IRedisClientConnectionManager,
} from "@fluidframework/server-services-utils";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import * as winston from "winston";
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

		redisClientConnectionManager.getRedisClient().on("error", (error) => {
			winston.error("Redis Tenant Cache Error:", error);
			Lumberjack.error("Redis Tenant Cache Error", undefined, error);
		});
	}

	public async exists(item: string): Promise<boolean> {
		const result = await this.redisClientConnectionManager
			.getRedisClient()
			.exists(this.getKey(item));
		return result >= 1;
	}

	public async set(
		key: string,
		value: string = "",
		expireAfterSeconds: number = this.expireAfterSeconds,
	): Promise<void> {
		const result = await this.redisClientConnectionManager
			.getRedisClient()
			.set(this.getKey(key), value, "EX", expireAfterSeconds);
		if (result !== "OK") {
			throw new Error(result);
		}
	}

	public async delete(key: string): Promise<boolean> {
		try {
			const result = await this.redisClientConnectionManager
				.getRedisClient()
				.del(this.getKey(key));
			return result === 1;
		} catch (error) {
			winston.error("Redis Tenant Cache delete Error:", error);
			Lumberjack.error("Redis Tenant Cache delete Error", undefined, error);
			return false;
		}
	}

	public async get(key: string): Promise<string> {
		return this.redisClientConnectionManager.getRedisClient().get(this.getKey(key));
	}

	/**
	 * Translates the input item to the one we will actually store in redis
	 */
	private getKey(item: string): string {
		return `${this.prefix}:${item}`;
	}
}
