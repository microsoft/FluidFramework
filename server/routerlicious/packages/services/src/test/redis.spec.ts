/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { TestRedisClientConnectionManager } from "@fluidframework/server-test-utils";

import { RedisCache } from "../redis";

describe("RedisCache", () => {
	it("stores entries without expiry when configured with a zero TTL", async () => {
		const connectionManager = new TestRedisClientConnectionManager();
		const redisClient = connectionManager.getRedisClient();
		const cache = new RedisCache(connectionManager, {
			expireAfterSeconds: 0,
			prefix: "git",
		});

		await cache.set("deletion-marker", "{}");

		assert.strictEqual(await redisClient.ttl("git:deletion-marker"), -1);
		await redisClient.flushall();
		await redisClient.quit();
	});

	it("only advances persistent deletion markers", async () => {
		const connectionManager = new TestRedisClientConnectionManager();
		const redisClient = connectionManager.getRedisClient();
		const cache = new RedisCache(connectionManager, {
			expireAfterSeconds: 0,
			prefix: "git",
		});

		await cache.set("deletedDocument:tenant:document", JSON.stringify(200));
		await cache.set("deletedDocument:tenant:document", JSON.stringify(100));

		assert.strictEqual(await cache.get("deletedDocument:tenant:document"), JSON.stringify(200));
		assert.strictEqual(await redisClient.ttl("git:deletedDocument:tenant:document"), -1);
		await redisClient.flushall();
		await redisClient.quit();
	});
});
