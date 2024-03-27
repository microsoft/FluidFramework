/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TestRedisClientConnectionManagerWithInvalidation } from "./testRedisClientConnectionManagerWithInvalidation";
import { RedisCache, RedisTenantCache } from "../services";
import { RedisOptions } from "ioredis-mock";
import assert from "assert";

type GitRedisFileSystem = "redisCache" | "redisTenantCache";

function createRedisFs(
	fileSystem: string,
	redisClientConnectionManager: TestRedisClientConnectionManagerWithInvalidation,
): RedisCache | RedisTenantCache {
	if (fileSystem === "redisCache") {
		return new RedisCache(redisClientConnectionManager);
	} else {
		return new RedisTenantCache(redisClientConnectionManager);
	}
}

const testCache: GitRedisFileSystem[] = ["redisCache", "redisTenantCache"];
testCache.forEach((fileSystem) => {
	describe(`Redis cache: ${fileSystem}`, () => {
		let redis: RedisCache | RedisTenantCache;
		const redisOptions: RedisOptions = {
			host: "localhost",
			port: 6379,
			connectTimeout: 10000,
			maxRetriesPerRequest: 20,
			enableAutoPipelining: false,
			enableOfflineQueue: true,
		};
		const redisClientConnectionManager = new TestRedisClientConnectionManagerWithInvalidation(
			redisOptions,
		);
		beforeEach(() => {
			redis = createRedisFs(fileSystem, redisClientConnectionManager);
		});
		afterEach(async () => {
			redisClientConnectionManager.invalidateRedisClient();
		});
		it("single key CRD operations should succeed", async () => {
			await assert.doesNotReject(async () => {
				await redis.set("foo", "bar");
			});
			assert.strictEqual(await redis.get<string>("foo"), "bar");
			if (redis instanceof RedisTenantCache) {
				assert.strictEqual(await redis.exists("foo"), true);
				assert.strictEqual(await redis.exists("foo1"), false);
			}
			assert.strictEqual(await redis.delete("foo"), true);
		});
		it("single key CRD operations should succeed with client invalidation", async () => {
			redisClientConnectionManager.invalidateRedisClient();
			await assert.doesNotReject(async () => {
				await redis.set("foo", "bar");
			});
			redisClientConnectionManager.invalidateRedisClient();
			assert.strictEqual(await redis.get<string>("foo"), "bar");
			redisClientConnectionManager.invalidateRedisClient();
			if (redis instanceof RedisTenantCache) {
				assert.strictEqual(await redis.exists("foo"), true);
				redisClientConnectionManager.invalidateRedisClient();
				assert.strictEqual(await redis.exists("foo1"), false);
			}
			assert.strictEqual(await redis.delete("foo"), true);
		});
		it("single key CRD operations should not succeed without client recreation", async () => {
			redisClientConnectionManager.invalidateRedisClient(false);
			assert.rejects(async () => {
				await redis.set("foo", "bar");
			});
			assert.rejects(async () => {
				await redis.get<string>("foo");
			});
			if (redis instanceof RedisTenantCache) {
				assert.rejects(async () => {
					await (redis as RedisTenantCache).exists("foo");
				});
				assert.rejects(async () => {
					await (redis as RedisTenantCache).exists("foo1");
				});
			}
			assert.rejects(async () => {
				await redis.delete("foo");
			});
		});
	});
});
