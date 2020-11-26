/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { RedisClient } from "redis";
import redis from "redis-mock";
import { IRequestMetrics, ThrottlerRequestType } from "@fluidframework/server-services-core";
import { RedisThrottleManager } from "../redisThrottleManager";
import Sinon from "sinon";

describe("RedisThrottleManager", () => {
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
    it("Creates and retrieves requestMetric", async () => {
        const throttleManager = new RedisThrottleManager(mockRedisClient);

        const id = "test-id-1";
        const requestType = ThrottlerRequestType.AlfredHttps;
        const requestMetric: IRequestMetrics = {
            count: 2,
            lastCoolDownAt: Date.now(),
            throttleStatus: false,
            throttleReason: "N/A",
            retryAfterInMs: 2500,
        };

        await throttleManager.setRequestMetric(id, requestType, requestMetric);
        const retrievedRequestMetric = await throttleManager.getRequestMetric(id, requestType);
        assert.deepStrictEqual(retrievedRequestMetric, requestMetric);
    });

    it("Creates and overwrites requestMetric", async () => {
        const throttleManager = new RedisThrottleManager(mockRedisClient);

        const id = "test-id-2";
        const requestType = ThrottlerRequestType.HistorianHttps;
        const originalRequestMetric: IRequestMetrics = {
            count: 2,
            lastCoolDownAt: Date.now(),
            throttleStatus: false,
            throttleReason: "N/A",
            retryAfterInMs: 0,
        };

        await throttleManager.setRequestMetric(id, requestType, originalRequestMetric);
        const retrievedRequestMetric = await throttleManager.getRequestMetric(id, requestType);
        assert.deepStrictEqual(retrievedRequestMetric, originalRequestMetric);

        const updatedRequestMetric: IRequestMetrics = {
            count: 0,
            lastCoolDownAt: Date.now(),
            throttleStatus: true,
            throttleReason: "Exceeded token count: Wait 5 seconds",
            retryAfterInMs: 5000,
        };
        await throttleManager.setRequestMetric(id, requestType, updatedRequestMetric);
        const retrievedUpdatedRequestMetric = await throttleManager.getRequestMetric(id, requestType);
        assert.deepStrictEqual(retrievedUpdatedRequestMetric, updatedRequestMetric);
    });

    it("Returns undefined when requestMetric does not exist", async () => {
        const throttleManager = new RedisThrottleManager(mockRedisClient);

        const id = "test-id-2";
        const requestType = ThrottlerRequestType.OpenSocketConn;

        const retrievedRequestMetric = await throttleManager.getRequestMetric(id, requestType);
        assert.strictEqual(retrievedRequestMetric, undefined);
    });

    it("Expires outdated values", async () => {
        const ttlInSeconds = 10;
        const throttleManager = new RedisThrottleManager(mockRedisClient, ttlInSeconds);

        const id = "test-id";
        const requestType = ThrottlerRequestType.HistorianHttps;
        const originalRequestMetric: IRequestMetrics = {
            count: 2,
            lastCoolDownAt: Date.now(),
            throttleStatus: false,
            throttleReason: "N/A",
            retryAfterInMs: 0,
        };
        await throttleManager.setRequestMetric(id, requestType, originalRequestMetric);

        // Move to just before the expiration date to make sure it is not prematurely expired
        Sinon.clock.tick(ttlInSeconds * 1000 - 1);
        let retrievedRequestMetric = await throttleManager.getRequestMetric(id, requestType);
        assert.deepStrictEqual(retrievedRequestMetric, originalRequestMetric);

        // move to end of expiration window when value should be expired
        Sinon.clock.tick(1);
        retrievedRequestMetric = await throttleManager.getRequestMetric(id, requestType);
        assert.strictEqual(retrievedRequestMetric, undefined);
    });

    it("Updates expiration on overwrite, then expires outdated values", async () => {
        const ttlInSeconds = 10;
        const throttleManager = new RedisThrottleManager(mockRedisClient, ttlInSeconds);

        const id = "test-id";
        const requestType = ThrottlerRequestType.HistorianHttps;
        const originalRequestMetric: IRequestMetrics = {
            count: 2,
            lastCoolDownAt: Date.now(),
            throttleStatus: false,
            throttleReason: "N/A",
            retryAfterInMs: 0,
        };
        await throttleManager.setRequestMetric(id, requestType, originalRequestMetric);

        // Move to just before the expiration date to make sure it is not prematurely expired
        Sinon.clock.tick(ttlInSeconds * 1000 - 1);
        let retrievedRequestMetric = await throttleManager.getRequestMetric(id, requestType);
        assert.deepStrictEqual(retrievedRequestMetric, originalRequestMetric);

        // Update stored value, which should reset expiration
        const updatedRequestMetric: IRequestMetrics = {
            ...originalRequestMetric,
            count: 3,
        };
        await throttleManager.setRequestMetric(id, requestType, updatedRequestMetric);

        // Move to end of new expiration window to make sure ttl was indeed updated
        Sinon.clock.tick(ttlInSeconds * 1000 - 1);
        retrievedRequestMetric = await throttleManager.getRequestMetric(id, requestType);
        assert.deepStrictEqual(retrievedRequestMetric, updatedRequestMetric);

        // move to end of expiration window when value should be expired
        Sinon.clock.tick(1);
        retrievedRequestMetric = await throttleManager.getRequestMetric(id, requestType);
        assert.strictEqual(retrievedRequestMetric, undefined);
    });
});
