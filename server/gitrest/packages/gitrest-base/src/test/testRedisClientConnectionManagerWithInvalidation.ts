/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRedisClientConnectionManager } from "@fluidframework/server-services-utils";
import type * as Redis from "ioredis";
import RedisMock from "ioredis-mock";

// TODO: Implement this in Routerlicious
export class TestRedisClientConnectionManagerWithInvalidation
	implements IRedisClientConnectionManager
{
	private readonly options: Redis.RedisOptions | undefined;
	private mockRedisClient: Redis.Redis;

	constructor(options?: Redis.RedisOptions) {
		this.options = options;
		this.mockRedisClient = this.createRedisClient();
	}

	private createRedisClient(): Redis.Redis {
		return this.options ? new RedisMock(this.options) : new RedisMock();
	}

	public invalidateRedisClient(recreateClient: boolean = true) {
		this.mockRedisClient.disconnect();
		if (recreateClient) {
			this.mockRedisClient = this.createRedisClient();
		}
	}

	public getRedisClient(): Redis.Redis {
		return this.mockRedisClient;
	}

	public addErrorHandler(
		lumberProperties: Record<string, any> = {},
		errorMessage: string = "Error with Redis",
		additionalLoggingFunctionality?: (error: Error) => boolean,
	): void {}
}
