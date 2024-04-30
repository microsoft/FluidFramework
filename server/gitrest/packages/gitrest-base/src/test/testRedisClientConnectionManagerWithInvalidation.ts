/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import RedisMock from "ioredis-mock";
import * as Redis from "ioredis";
import { IRedisClientConnectionManager } from "@fluidframework/server-services-utils";

// TODO: Implement this in Routerlicious
export class TestRedisClientConnectionManagerWithInvalidation
	implements IRedisClientConnectionManager
{
	private readonly options: Redis.RedisOptions;
	private mockRedisClient: Redis.Redis;

	constructor(options?) {
		this.options = options;
		this.createRedisClient();
	}

	private createRedisClient() {
		this.mockRedisClient = this.options ? new RedisMock(this.options) : new RedisMock();
	}

	public invalidateRedisClient(recreateClient: boolean = true) {
		this.mockRedisClient.disconnect();
		if (recreateClient) {
			this.createRedisClient();
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
