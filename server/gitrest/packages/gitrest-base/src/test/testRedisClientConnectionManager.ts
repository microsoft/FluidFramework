/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import RedisMock from "ioredis-mock";
import * as Redis from "ioredis";
import { IRedisClientConnectionManager } from "../redisClientConnectionManager";

export class TestRedisClientConnectionManager implements IRedisClientConnectionManager {
	private readonly options: Redis.RedisOptions;

	constructor(options?) {
		this.options = options;
	}

	public async authenticateAndCreateRedisClient(): Promise<void> {
		// Dummy implementation
	}

	public getRedisClient(): Redis.Redis {
		const mockRedisClient: Redis.Redis = this.options
			? new RedisMock(this.options)
			: new RedisMock();
		return mockRedisClient;
	}
}
