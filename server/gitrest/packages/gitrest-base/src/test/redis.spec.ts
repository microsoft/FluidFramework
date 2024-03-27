/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TestRedisClientConnectionManagerWithInvalidation } from "./testRedisClientConnectionManagerWithInvalidation";
import { Redis, HashMapRedis } from "../utils/redisFs/redis";
import { RedisOptions } from "ioredis-mock";
import assert from "assert";

type GitRedisFileSystem = "redisfs" | "hashmap-redisfs";

function createRedisFs(
	fileSystem: string,
	redisClientConnectionManager: TestRedisClientConnectionManagerWithInvalidation,
): Redis | HashMapRedis {
	if (fileSystem === "hashmap-redisfs") {
		const key = "test";
		return new HashMapRedis(key, redisClientConnectionManager);
	} else {
		return new Redis(redisClientConnectionManager);
	}
}

const testFileSystems: GitRedisFileSystem[] = ["redisfs", "hashmap-redisfs"];
testFileSystems.forEach((fileSystem) => {
	describe(`RedisFs ${fileSystem} file system`, () => {
		let redis: Redis | HashMapRedis;
		const redisOptions: RedisOptions = {
			host: "localhost",
			port: 6379,
			connectTimeout: 10000,
			maxRetriesPerRequest: 20,
			enableAutoPipelining: false,
			enableOfflineQueue: true,
		};
		let redisClientConnectionManager: TestRedisClientConnectionManagerWithInvalidation;
		beforeEach(() => {
			redisClientConnectionManager = new TestRedisClientConnectionManagerWithInvalidation(
				redisOptions,
			);
			redis = createRedisFs(fileSystem, redisClientConnectionManager);
		});
		afterEach(async () => {
			await redis.delAll("");
			redisClientConnectionManager.invalidateRedisClient();
		});
		it("single key CRD operations should succeed", async () => {
			await assert.doesNotReject(async () => await redis.set("foo", "bar"));
			assert.strictEqual(await redis.get<string>("foo"), "bar");
			assert.notStrictEqual(await redis.peek("foo"), -1);
			assert.strictEqual(await redis.peek("foo"), 3);
			assert.strictEqual(await redis.del("foo"), true);
		});
		it("multi key CRD operations should succeed", async () => {
			const keyValuePairs = [
				{ key: "foo", value: "bar" },
				{ key: "foo1", value: "bar1" },
			];
			await assert.doesNotReject(async () => await redis.setMany(keyValuePairs));
			assert.strictEqual(await redis.get<string>("foo1"), "bar1");
			assert.deepStrictEqual(await redis.keysByPrefix("foo"), ["foo", "foo1"]);
			assert.strictEqual(await redis.delAll("foo"), true);
		});
		it("single key CRD operations should succeed with client invalidation", async () => {
			redisClientConnectionManager.invalidateRedisClient();
			await assert.doesNotReject(async () => await redis.set("foo", "bar"));
			redisClientConnectionManager.invalidateRedisClient();
			assert.strictEqual(await redis.get<string>("foo"), "bar");
			redisClientConnectionManager.invalidateRedisClient();
			assert.notStrictEqual(await redis.peek("foo"), -1);
			redisClientConnectionManager.invalidateRedisClient();
			assert.strictEqual(await redis.peek("foo"), 3);
			redisClientConnectionManager.invalidateRedisClient();
			assert.strictEqual(await redis.del("foo"), true);
		});
		it("multi key CRD operations should succeed with client invalidation", async () => {
			redisClientConnectionManager.invalidateRedisClient();
			const keyValuePairs = [
				{ key: "foo", value: "bar" },
				{ key: "foo1", value: "bar1" },
			];
			await assert.doesNotReject(async () => await redis.setMany(keyValuePairs));
			redisClientConnectionManager.invalidateRedisClient();
			assert.strictEqual(await redis.get<string>("foo1"), "bar1");
			redisClientConnectionManager.invalidateRedisClient();
			assert.deepStrictEqual(await redis.keysByPrefix("foo"), ["foo", "foo1"]);
			redisClientConnectionManager.invalidateRedisClient();
			assert.strictEqual(await redis.delAll("foo"), true);
		});
		it("single key CRD operations should not succeed without client recreation", async () => {
			redisClientConnectionManager.invalidateRedisClient(false);
			assert.rejects(async () => await redis.set("foo", "bar"));
			assert.rejects(async () => await redis.get<string>("foo"));
			assert.rejects(async () => await redis.peek("foo"));
			assert.rejects(async () => redis.peek("foo"));
			assert.rejects(async () => await redis.del("foo"));
		});
		it("multi key CRD operations should not succeed without client recreation", async () => {
			redisClientConnectionManager.invalidateRedisClient(false);
			const keyValuePairs = [
				{ key: "foo", value: "bar" },
				{ key: "foo1", value: "bar1" },
			];
			assert.rejects(async () => await redis.setMany(keyValuePairs));
			assert.rejects(async () => await redis.get<string>("foo1"));
			assert.rejects(async () => await redis.keysByPrefix("foo"));
			assert.rejects(async () => await redis.delAll("foo"));
		});
	});
});
