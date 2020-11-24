/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { RedisClient } from "redis";
import redis from "redis-mock";
import { IRequestMetrics, ThrottlerRequestType } from "@fluidframework/server-services-core";
import { RedisThrottleManager } from "../redisThrottleManager";

describe("RedisThrottleManager", () => {
    let mockRedisClient: RedisClient;
    beforeEach(() => {
        mockRedisClient = redis.createClient() as RedisClient;
    });
    afterEach(() => {
        mockRedisClient.flushall();
        mockRedisClient.end();
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
});
