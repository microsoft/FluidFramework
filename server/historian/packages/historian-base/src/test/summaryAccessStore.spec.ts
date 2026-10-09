/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import type * as Redis from "ioredis";
import * as sinon from "sinon";

import {
	MalformedEphemeralSummaryAccessRecordError,
	RedisCache,
	isEphemeralSummaryAccessStore,
} from "../services";
import { TestRedisClientConnectionManagerWithInvalidation } from "./testRedisClientConnectionManagerWithInvalidation";

describe("RedisCache ephemeral summary access", () => {
	const redisClientConnectionManager = new TestRedisClientConnectionManagerWithInvalidation();
	let cache: RedisCache;
	let rawRedis: Redis.Redis;

	beforeEach(async () => {
		cache = new RedisCache(redisClientConnectionManager);
		rawRedis = redisClientConnectionManager.getRedisClient();
		await rawRedis.flushall();
	});

	afterEach(() => {
		sinon.restore();
		redisClientConnectionManager.invalidateRedisClient();
	});

	it("exposes the ephemeral summary access store contract", () => {
		assert.strictEqual(isEphemeralSummaryAccessStore(cache), true);
		assert.strictEqual(isEphemeralSummaryAccessStore(undefined), false);
	});

	it("returns undefined for a clean miss", async () => {
		assert.strictEqual(await cache.readSummaryAccess("tenant/a", "missing"), undefined);
	});

	it("isolates identical document ids by tenant", async () => {
		const expiresAt = Date.now() + 60_000;

		await cache.activateSummaryAccessIfNotDeleted("tenant/a", "shared:id", 100, expiresAt);
		await cache.activateSummaryAccessIfNotDeleted("tenant/b", "shared:id", 200, expiresAt);

		assert.deepStrictEqual(await cache.readSummaryAccess("tenant/a", "shared:id"), {
			version: 1,
			state: "active",
			createTime: 100,
		});
		assert.deepStrictEqual(await cache.readSummaryAccess("tenant/b", "shared:id"), {
			version: 1,
			state: "active",
			createTime: 200,
		});
	});

	for (const malformedValue of [
		"unexpected",
		"A:",
		"A:-1",
		"A:1.5",
		"A:1 ",
		"D:NaN",
		"X:100",
		"A:100:extra",
	]) {
		it(`rejects and retains malformed stored record ${JSON.stringify(
			malformedValue,
		)}`, async () => {
			const key = "git:summaryAccess:v1:tenant%2Fa:shared%3Aid";
			await rawRedis.set(key, malformedValue);

			await assert.rejects(
				cache.readSummaryAccess("tenant/a", "shared:id"),
				MalformedEphemeralSummaryAccessRecordError,
			);
			assert.strictEqual(await rawRedis.get(key), malformedValue);
		});
	}

	it("creates access once without replacing an existing active generation", async () => {
		const expiresAt = Date.now() + 60_000;
		assert.strictEqual(
			await cache.activateSummaryAccessIfNotDeleted("tenant/a", "doc", 100, expiresAt),
			"created",
		);
		assert.strictEqual(
			await cache.activateSummaryAccessIfNotDeleted("tenant/a", "doc", 200, expiresAt),
			"alreadyActive",
		);
		assert.deepStrictEqual(await cache.readSummaryAccess("tenant/a", "doc"), {
			version: 1,
			state: "active",
			createTime: 100,
		});
	});

	it("marks active access deleted and keeps deletion idempotent", async () => {
		const expiresAt = Date.now() + 60_000;
		await cache.activateSummaryAccessIfNotDeleted("tenant/a", "doc", 100, expiresAt);

		await cache.markSummaryAccessDeleted("tenant/a", "doc", 100, expiresAt);
		await cache.markSummaryAccessDeleted("tenant/a", "doc", 100, expiresAt);

		assert.deepStrictEqual(await cache.readSummaryAccess("tenant/a", "doc"), {
			version: 1,
			state: "deleted",
			createTime: 100,
		});
	});

	it("does not reactivate a deleted document", async () => {
		const expiresAt = Date.now() + 60_000;
		await cache.markSummaryAccessDeleted("tenant/a", "doc", 100, expiresAt);

		const result = await cache.activateSummaryAccessIfNotDeleted(
			"tenant/a",
			"doc",
			200,
			expiresAt,
		);

		assert.strictEqual(result, "deleted");
		assert.deepStrictEqual(await cache.readSummaryAccess("tenant/a", "doc"), {
			version: 1,
			state: "deleted",
			createTime: 100,
		});
	});

	it("does not overwrite malformed state during atomic activation", async () => {
		const key = "git:summaryAccess:v1:tenant%2Fa:doc";
		await rawRedis.set(key, "unexpected");

		await assert.rejects(
			cache.activateSummaryAccessIfNotDeleted("tenant/a", "doc", 100, Date.now() + 60_000),
			MalformedEphemeralSummaryAccessRecordError,
		);
		assert.strictEqual(await rawRedis.get(key), "unexpected");
	});

	for (const statePrefix of ["A", "D"]) {
		it(`rejects and retains an unsafe ${statePrefix} timestamp during atomic activation`, async () => {
			const key = "git:summaryAccess:v1:tenant%2Fa:doc";
			const malformedValue = `${statePrefix}:9007199254740992`;
			await rawRedis.set(key, malformedValue);

			await assert.rejects(
				cache.activateSummaryAccessIfNotDeleted(
					"tenant/a",
					"doc",
					100,
					Date.now() + 60_000,
				),
				MalformedEphemeralSummaryAccessRecordError,
			);
			assert.strictEqual(await rawRedis.get(key), malformedValue);
		});
	}

	for (const invalidCreateTime of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
		it(`rejects invalid createTime ${invalidCreateTime}`, async () => {
			await assert.rejects(
				cache.activateSummaryAccessIfNotDeleted(
					"tenant/a",
					"doc",
					invalidCreateTime,
					Date.now() + 60_000,
				),
				/Ephemeral summary access createTime must be a finite timestamp/,
			);
			await assert.rejects(
				cache.markSummaryAccessDeleted(
					"tenant/a",
					"doc",
					invalidCreateTime,
					Date.now() + 60_000,
				),
				/Ephemeral summary access createTime must be a finite timestamp/,
			);
		});
	}

	it("rejects a non-finite expiration", async () => {
		await assert.rejects(
			cache.activateSummaryAccessIfNotDeleted(
				"tenant/a",
				"doc",
				100,
				Number.POSITIVE_INFINITY,
			),
			/Ephemeral summary access expiration must be finite/,
		);
		await assert.rejects(
			cache.markSummaryAccessDeleted("tenant/a", "doc", 100, Number.NaN),
			/Ephemeral summary access expiration must be finite/,
		);
	});

	it("expires access state at the supplied lifetime", async () => {
		const clock = sinon.useFakeTimers();
		await cache.activateSummaryAccessIfNotDeleted("tenant/a", "doc", 100, 1000);

		await clock.tickAsync(1001);
		assert.strictEqual(await cache.readSummaryAccess("tenant/a", "doc"), undefined);
	});
});
