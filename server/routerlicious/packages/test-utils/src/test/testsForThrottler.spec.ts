/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IThrottlerResponse } from "@fluidframework/server-services-core";
import assert from "assert";
import Sinon from "sinon";
import { TestThrottleStorageManager } from "../testThrottleStorageManager";
import { TestThrottlerHelper } from "../testThrottlerHelper";

describe("Test for Test Utils", () => {
    beforeEach(() => {
        // use fake timers to have full control over the passage of time
        Sinon.useFakeTimers();
    });

    afterEach(() => {
        Sinon.restore();
    });

    describe("Throttler", () => {
        it("throttles on too many operations", async () => {
            const limit = 10;
            const rate = 100;
            const throttleManager = new TestThrottleStorageManager();
            const throttler = new TestThrottlerHelper(throttleManager, limit, rate);

            const id = "test-id";

            let response: IThrottlerResponse;
            for (let i = 0; i < limit; i++) {
                response =  await throttler.updateCount(id, 1);
                assert.strictEqual(response.throttleStatus, false);
            }
            response =  await throttler.updateCount(id, 1);
            assert.strictEqual(response.throttleStatus, true);
        });

        it("throttles on too large operation", async () => {
            const limit = 10;
            const rate = 100;
            const throttleManager = new TestThrottleStorageManager();
            const throttler = new TestThrottlerHelper(throttleManager, limit, rate);

            const id = "test-id";

            const response =  await throttler.updateCount(id, limit + 1);
            assert.strictEqual(response.throttleStatus, true);
        });

        it("un-throttles after sufficient cooldown time", async () => {
            const limit = 10;
            const rate = 100;
            const throttleManager = new TestThrottleStorageManager();
            const throttler = new TestThrottlerHelper(throttleManager, limit, rate);

            const id = "test-id";

            let response =  await throttler.updateCount(id, limit + 1);
            assert.strictEqual(response.throttleStatus, true);

            Sinon.clock.tick(response.retryAfterInMs);
            response =  await throttler.updateCount(id, 0);
            assert.strictEqual(response.throttleStatus, false);
        });

        it("does not throttle sufficiently metered out operations", async () => {
            const limit = 10;
            const rate = 100;
            const throttleManager = new TestThrottleStorageManager();
            const throttler = new TestThrottlerHelper(throttleManager, limit, rate);

            const id = "test-id";

            let response: IThrottlerResponse;
            for (let i = 0; i < limit * 2; i++) {
                response =  await throttler.updateCount(id, 1);
                assert.strictEqual(response.throttleStatus, false);
                Sinon.clock.tick(rate);
            }
            response =  await throttler.updateCount(id, 1);
            assert.strictEqual(response.throttleStatus, false);
        });

        it("stores most recently calculated throttle status in cache", async () => {
            const limit = 10;
            const rate = 100;
            const throttleManager = new TestThrottleStorageManager();
            const throttler = new TestThrottlerHelper(throttleManager, limit, rate);

            const id = "test-id";

            let response: IThrottlerResponse;
            let cachedResponse: IThrottlerResponse;

            response =  await throttler.updateCount(id, 10);
            assert.strictEqual(response.throttleStatus, false);
            cachedResponse = await throttler.getThrottleStatus(id);
            assert.deepStrictEqual(cachedResponse, response);

            response =  await throttler.updateCount(id, 1);
            assert.strictEqual(response.throttleStatus, true);
            cachedResponse = await throttler.getThrottleStatus(id);
            assert.deepStrictEqual(cachedResponse, response);
        });
    });
});
