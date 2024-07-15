/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import RedisMock from "ioredis-mock";
import * as Redis from "ioredis";

/**
 * Adding a duplicate of the IRedisClientConnectionManager interface from server-services-utils
 * to prevent a cyclic dependency between server-services-utils and test-utils
 */
export interface IRedisClientConnectionManager {
	getRedisClient(): Redis.default | Redis.Cluster;
}

export class TestRedisClientConnectionManager implements IRedisClientConnectionManager {
	private readonly options: Redis.RedisOptions;

	constructor(options?) {
		this.options = options;
	}

	public getRedisClient(): Redis.Redis {
		const mockRedisClient: Redis.Redis = this.options
			? new RedisMock(this.options)
			: new RedisMock();
		return mockRedisClient;
	}

	public addErrorHandler(
		lumberProperties?: Map<string, any> | Record<string, any> | undefined,
		errorMessage: string = "Error with Redis",
		additionalLoggingFunctionality?: (error: Error) => boolean,
	): void {
		// Do nothing
	}
}
