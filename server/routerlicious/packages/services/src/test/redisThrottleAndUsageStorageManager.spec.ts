/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { Redis } from "ioredis";
import RedisMock from "ioredis-mock";
import { IThrottlingMetrics, IUsageData } from "@fluidframework/server-services-core";
import { TestEngine1, Lumberjack } from "@fluidframework/server-services-telemetry";
import { RedisThrottleAndUsageStorageManager } from "../redisThrottleAndUsageStorageManager";
import Sinon from "sinon";

const lumberjackEngine = new TestEngine1();
if (!Lumberjack.isSetupCompleted()) {
    Lumberjack.setup([lumberjackEngine]);
}

describe("RedisThrottleAndUsageStorageManager", () => {
    let mockRedisClient: Redis;
    beforeEach(() => {
        // use fake timers to have full control over the passage of time
        Sinon.useFakeTimers()
        mockRedisClient = new RedisMock() as Redis;
    });
    afterEach(() => {
        mockRedisClient.flushall();
        mockRedisClient.quit();
        Sinon.restore();
    });
    it("Creates and retrieves throttlingMetric", async () => {
        const throttleManager = new RedisThrottleAndUsageStorageManager(mockRedisClient);

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
        const throttleManager = new RedisThrottleAndUsageStorageManager(mockRedisClient);

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
        const throttleManager = new RedisThrottleAndUsageStorageManager(mockRedisClient);

        const id = "test-id";

        const retrievedThrottlingMetric = await throttleManager.getThrottlingMetric(id);
        assert.strictEqual(retrievedThrottlingMetric, undefined);
    });

    it("Expires outdated values", async () => {
        const ttlInSeconds = 10;
        const throttleManager = new RedisThrottleAndUsageStorageManager(mockRedisClient, { expireAfterSeconds: ttlInSeconds });

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
        const throttleManager = new RedisThrottleAndUsageStorageManager(mockRedisClient, { expireAfterSeconds: ttlInSeconds });

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

    it("Creates and retrieves throttlingMetric and usageData", async () => {
        const throttleManager = new RedisThrottleAndUsageStorageManager(mockRedisClient);

        const id = "test-id";
        const throttlingMetric: IThrottlingMetrics = {
            count: 2,
            lastCoolDownAt: Date.now(),
            throttleStatus: false,
            throttleReason: "N/A",
            retryAfterInMs: 2500,
        };

        const storageId = "usage-storage-id";
        const usageData: IUsageData = {
            value: 1,
            tenantId: "testTenant",
            documentId: "testDocument",
        };

        await throttleManager.setThrottlingMetricAndUsageData(
            id,
            throttlingMetric,
            storageId,
            usageData);
        const retrievedThrottlingMetric = await throttleManager.getThrottlingMetric(id);
        assert.deepStrictEqual(retrievedThrottlingMetric, throttlingMetric);
        const retrievedUsageData = await throttleManager.getUsageData(storageId);
        assert.deepStrictEqual(retrievedUsageData, usageData);
    });

    it("Creates and retrieves usageData", async () => {
        const throttleManager = new RedisThrottleAndUsageStorageManager(mockRedisClient);

        const storageId = "usage-storage-id";
        const usageData: IUsageData = {
            value: 1,
            tenantId: "testTenant",
            documentId: "testDocument",
        };

        await throttleManager.setUsageData(storageId, usageData);
        const retrievedUsageData = await throttleManager.getUsageData(storageId);
        assert.deepStrictEqual(retrievedUsageData, usageData);
    });
});
