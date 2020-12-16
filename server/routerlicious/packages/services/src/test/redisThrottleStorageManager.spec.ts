/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { RedisClient } from "redis";
import redis from "redis-mock";
import { IThrottlingMetrics } from "@fluidframework/server-services-core";
import { RedisThrottleStorageManager } from "../redisThrottleStorageManager";
import Sinon from "sinon";

describe("RedisThrottleStorageManager", () => {
    let mockRedisClient: RedisClient;
    beforeEach(() => {
        // use fake timers to have full control over the passage of time
        Sinon.useFakeTimers()
        mockRedisClient = redis.createClient() as RedisClient;
    });
    afterEach(() => {
        mockRedisClient.flushall();
        mockRedisClient.end();
        Sinon.restore();
    });
    it("Creates and retrieves throttlingMetric", async () => {
        const throttleManager = new RedisThrottleStorageManager(mockRedisClient);

        const id = "test-id";
        const throttlingMetric: IThrottlingMetrics = {
            count: 2,
            lastCoolDownAt: Date.now(),
            throttleStatus: false,
            throttleReason: "N/A",
            retryAfterInMs: 2500,
        };

        await throttleManager.setThrottlingMetric(id, throttlingMetric);
        const retrievedThrottlingMetric = await throttleManager.getThrottlingMetric(id);
        assert.deepStrictEqual(retrievedThrottlingMetric, throttlingMetric);
    });

    it("Creates and overwrites throttlingMetric", async () => {
        const throttleManager = new RedisThrottleStorageManager(mockRedisClient);

        const id = "test-id";
        const originalThrottlingMetric: IThrottlingMetrics = {
            count: 2,
            lastCoolDownAt: Date.now(),
            throttleStatus: false,
            throttleReason: "N/A",
            retryAfterInMs: 0,
        };

        await throttleManager.setThrottlingMetric(id, originalThrottlingMetric);
        const retrievedThrottlingMetric = await throttleManager.getThrottlingMetric(id);
        assert.deepStrictEqual(retrievedThrottlingMetric, originalThrottlingMetric);

        const updatedThrottlingMetric: IThrottlingMetrics = {
            count: 0,
            lastCoolDownAt: Date.now(),
            throttleStatus: true,
            throttleReason: "Exceeded token count: Wait 5 seconds",
            retryAfterInMs: 5000,
        };
        await throttleManager.setThrottlingMetric(id, updatedThrottlingMetric);
        const retrievedUpdatedThrottlingMetric = await throttleManager.getThrottlingMetric(id);
        assert.deepStrictEqual(retrievedUpdatedThrottlingMetric, updatedThrottlingMetric);
    });

    it("Returns undefined when throttlingMetric does not exist", async () => {
        const throttleManager = new RedisThrottleStorageManager(mockRedisClient);

        const id = "test-id";

        const retrievedThrottlingMetric = await throttleManager.getThrottlingMetric(id);
        assert.strictEqual(retrievedThrottlingMetric, undefined);
    });

    it("Expires outdated values", async () => {
        const ttlInSeconds = 10;
        const throttleManager = new RedisThrottleStorageManager(mockRedisClient, ttlInSeconds);

        const id = "test-id";
        const originalThrottlingMetric: IThrottlingMetrics = {
            count: 2,
            lastCoolDownAt: Date.now(),
            throttleStatus: false,
            throttleReason: "N/A",
            retryAfterInMs: 0,
        };
        await throttleManager.setThrottlingMetric(id, originalThrottlingMetric);

        // Move to just before the expiration date to make sure it is not prematurely expired
        Sinon.clock.tick(ttlInSeconds * 1000 - 1);
        let retrievedThrottlingMetric = await throttleManager.getThrottlingMetric(id);
        assert.deepStrictEqual(retrievedThrottlingMetric, originalThrottlingMetric);

        // move to end of expiration window when value should be expired
        Sinon.clock.tick(1);
        retrievedThrottlingMetric = await throttleManager.getThrottlingMetric(id);
        assert.strictEqual(retrievedThrottlingMetric, undefined);
    });

    it("Updates expiration on overwrite, then expires outdated values", async () => {
        const ttlInSeconds = 10;
        const throttleManager = new RedisThrottleStorageManager(mockRedisClient, ttlInSeconds);

        const id = "test-id";
        const originalThrottlingMetric: IThrottlingMetrics = {
            count: 2,
            lastCoolDownAt: Date.now(),
            throttleStatus: false,
            throttleReason: "N/A",
            retryAfterInMs: 0,
        };
        await throttleManager.setThrottlingMetric(id, originalThrottlingMetric);

        // Move to just before the expiration date to make sure it is not prematurely expired
        Sinon.clock.tick(ttlInSeconds * 1000 - 1);
        let retrievedThrottlingMetric = await throttleManager.getThrottlingMetric(id);
        assert.deepStrictEqual(retrievedThrottlingMetric, originalThrottlingMetric);

        // Update stored value, which should reset expiration
        const updatedThrottlingMetric: IThrottlingMetrics = {
            ...originalThrottlingMetric,
            count: 3,
        };
        await throttleManager.setThrottlingMetric(id, updatedThrottlingMetric);

        // Move to end of new expiration window to make sure ttl was indeed updated
        Sinon.clock.tick(ttlInSeconds * 1000 - 1);
        retrievedThrottlingMetric = await throttleManager.getThrottlingMetric(id);
        assert.deepStrictEqual(retrievedThrottlingMetric, updatedThrottlingMetric);

        // move to end of expiration window when value should be expired
        Sinon.clock.tick(1);
        retrievedThrottlingMetric = await throttleManager.getThrottlingMetric(id);
        assert.strictEqual(retrievedThrottlingMetric, undefined);
    });
});
