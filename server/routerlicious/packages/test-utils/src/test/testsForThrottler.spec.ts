/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IThrottlerResponse, ThrottlerRequestType } from "@fluidframework/server-services-core";
import assert from "assert";
import Sinon from "sinon";
import { TestThrottleManager } from "../testThrottleManager";
import { TestThrottler } from "../testThrottler";

describe("Test for Test Utils", () => {
    beforeEach(() => {
        // use fake timers to have full control over the passage of time
        Sinon.useFakeTimers();
    });

    afterEach(() => {
        Sinon.restore();
    });

    describe("Throttler", () => {
        it("throttles on too many requests", async () => {
            const limit = 10;
            const rate = 100;
            const throttleManager = new TestThrottleManager();
            const throttler = new TestThrottler(throttleManager, limit, rate);

            const id = "test-id";
            const requestType = ThrottlerRequestType.AlfredHttps;

            let response: IThrottlerResponse;
            for (let i = 0; i < limit; i++) {
                response =  await throttler.updateRequestCount(id, requestType, 1);
                assert.strictEqual(response.throttleStatus, false);
            }
            response =  await throttler.updateRequestCount(id, requestType, 1);
            assert.strictEqual(response.throttleStatus, true);
        });

        it("throttles on too large request", async () => {
            const limit = 10;
            const rate = 100;
            const throttleManager = new TestThrottleManager();
            const throttler = new TestThrottler(throttleManager, limit, rate);

            const id = "test-id";
            const requestType = ThrottlerRequestType.AlfredHttps;

            const response =  await throttler.updateRequestCount(id, requestType, limit + 1);
            assert.strictEqual(response.throttleStatus, true);
        });

        it("un-throttles after sufficient cooldown time", async () => {
            const limit = 10;
            const rate = 100;
            const throttleManager = new TestThrottleManager();
            const throttler = new TestThrottler(throttleManager, limit, rate);

            const id = "test-id";
            const requestType = ThrottlerRequestType.AlfredHttps;

            let response =  await throttler.updateRequestCount(id, requestType, limit + 1);
            assert.strictEqual(response.throttleStatus, true);

            Sinon.clock.tick(response.retryAfterInMs);
            response =  await throttler.updateRequestCount(id, requestType, 0);
            assert.strictEqual(response.throttleStatus, false);
        });

        it("does not throttle sufficiently metered out requests", async () => {
            const limit = 10;
            const rate = 100;
            const throttleManager = new TestThrottleManager();
            const throttler = new TestThrottler(throttleManager, limit, rate);

            const id = "test-id";
            const requestType = ThrottlerRequestType.AlfredHttps;

            let response: IThrottlerResponse;
            for (let i = 0; i < limit * 2; i++) {
                response =  await throttler.updateRequestCount(id, requestType, 1);
                assert.strictEqual(response.throttleStatus, false);
                Sinon.clock.tick(rate);
            }
            response =  await throttler.updateRequestCount(id, requestType, 1);
            assert.strictEqual(response.throttleStatus, false);
        });

        it("stores most recently calculated throttle status in cache", async () => {
            const limit = 10;
            const rate = 100;
            const throttleManager = new TestThrottleManager();
            const throttler = new TestThrottler(throttleManager, limit, rate);

            const id = "test-id";
            const requestType = ThrottlerRequestType.AlfredHttps;

            let response: IThrottlerResponse;
            let cachedResponse: IThrottlerResponse;

            response =  await throttler.updateRequestCount(id, requestType, 10);
            assert.strictEqual(response.throttleStatus, false);
            cachedResponse = await throttler.getThrottleStatus(id, requestType);
            assert.deepStrictEqual(cachedResponse, response);

            response =  await throttler.updateRequestCount(id, requestType, 1);
            assert.strictEqual(response.throttleStatus, true);
            cachedResponse = await throttler.getThrottleStatus(id, requestType);
            assert.deepStrictEqual(cachedResponse, response);
        });

        it("throttles one id, but not another with same requestType", async () => {
            const limit = 10;
            const rate = 100;
            const throttleManager = new TestThrottleManager();
            const throttler = new TestThrottler(throttleManager, limit, rate);

            const id1 = "test-id-1";
            const id2 = "test-id-2";
            const requestType = ThrottlerRequestType.AlfredHttps;

            const response1 =  await throttler.updateRequestCount(id1, requestType, limit + 1);
            assert.strictEqual(response1.throttleStatus, true);
            const response2 =  await throttler.updateRequestCount(id2, requestType, limit - 1);
            assert.strictEqual(response2.throttleStatus, false);
        });

        it("throttles one requestType, but not another with same id", async () => {
            const limit = 10;
            const rate = 100;
            const throttleManager = new TestThrottleManager();
            const throttler = new TestThrottler(throttleManager, limit, rate);

            const id = "test-id";
            const requestType1 = ThrottlerRequestType.AlfredHttps;
            const requestType2 = ThrottlerRequestType.HistorianHttps;

            const response1 =  await throttler.updateRequestCount(id, requestType1, limit + 1);
            assert.strictEqual(response1.throttleStatus, true);
            const response2 =  await throttler.updateRequestCount(id, requestType2, limit - 1);
            assert.strictEqual(response2.throttleStatus, false);
        });
    });
});
