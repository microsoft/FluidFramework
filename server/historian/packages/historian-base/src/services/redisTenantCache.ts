/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRedisParameters } from "@fluidframework/server-services-utils";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import * as Redis from "ioredis";
import * as winston from "winston";
/**
 * Redis based cache client for caching and expiring tenants and tokens.
 */
export class RedisTenantCache {
	private readonly expireAfterSeconds: number = 60 * 60 * 24;
	private readonly prefix: string = "tenant";

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

		client.on("error", (error) => {
			winston.error("Redis Tenant Cache Error:", error);
			Lumberjack.error("Redis Tenant Cache Error", undefined, error);
		});
	}

	public async exists(item: string): Promise<boolean> {
		const result = await this.client.exists(this.getKey(item));
		return result >= 1;
	}

	public async set(
		key: string,
		value: string = "",
		expireAfterSeconds: number = this.expireAfterSeconds,
	): Promise<void> {
		const result = await this.client.set(this.getKey(key), value, "EX", expireAfterSeconds);
		if (result !== "OK") {
			throw new Error(result);
		}
	}

	public async delete(key: string): Promise<boolean> {
		const result = await this.client.del(this.getKey(key));
		return result === 1;
	}

	public async get(key: string): Promise<string> {
		return this.client.get(this.getKey(key));
	}

	/**
	 * Translates the input item to the one we will actually store in redis
	 */
	private getKey(item: string): string {
		return `${this.prefix}:${item}`;
	}
}
