/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IThrottlerResponse } from "@fluidframework/server-services-core";
import { TestThrottleStorageManager } from "@fluidframework/server-test-utils";
import assert from "assert";
import Sinon from "sinon";
import { ThrottlerHelper } from "../throttlerHelper";

describe("ThrottlerHelper", () => {
    beforeEach(() => {
        // use fake timers to have full control over the passage of time
        Sinon.useFakeTimers();
    });

    afterEach(() => {
        Sinon.restore();
    });

    it("throttles on many individual operations", async () => {
        const rate = 100;
        const cooldownInterval = 1000;
        const operationsPerCooldown = cooldownInterval / rate;
        let weight: number = 1;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleStorageManager();
        const throttler = new ThrottlerHelper(throttleStorageManager, rate, cooldownInterval);

        const id = "test-id";
        for (let i = 0; i < operationsPerCooldown; i++) {
            response = await throttler.updateCount(id, weight);
            assert.strictEqual(response.throttleStatus, false, `operation ${i + 1} should not be throttled`);
        }
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation ${operationsPerCooldown + 1} should be throttled`);
    });

    it("throttles on a few operation batches", async () => {
        const rate = 100;
        const cooldownInterval = 1000;
        const operationsPerCooldown = cooldownInterval / rate;
        let weight: number = 2;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleStorageManager();
        const throttler = new ThrottlerHelper(throttleStorageManager, rate, cooldownInterval);

        const id = "test-id";
        for (let i = 0; i < operationsPerCooldown / weight; i++) {
            response = await throttler.updateCount(id, weight)
            assert.strictEqual(response.throttleStatus, false, `operation ${i + 1} should not be throttled`);
        }
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation ${operationsPerCooldown / weight + 1} should be throttled`);
    });

    it("throttles on one operation batch", async () => {
        const rate = 100;
        const cooldownInterval = 1000;
        const operationsPerCooldown = cooldownInterval / rate;
        let weight: number = operationsPerCooldown + 1;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleStorageManager();
        const throttler = new ThrottlerHelper(throttleStorageManager, rate, cooldownInterval);

        const id = "test-id";

        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);
    });

    it("un-throttles after cooldown", async () => {
        const rate = 100;
        const cooldownInterval = 1000;
        const operationsPerCooldown = cooldownInterval / rate;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleStorageManager();
        const throttler = new ThrottlerHelper(throttleStorageManager, rate, cooldownInterval);

        const id = "test-id";

        weight = operationsPerCooldown * 2 - 1;
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);

        Sinon.clock.tick(cooldownInterval + 1);

        weight = 1
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, false, `operation after ${cooldownInterval + 1}ms should not be throttled`);
    });

    it("un-throttles after double cooldown", async () => {
        const rate = 100;
        const cooldownInterval = 1000;
        const operationsPerCooldown = cooldownInterval / rate;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleStorageManager();
        const throttler = new ThrottlerHelper(throttleStorageManager, rate, cooldownInterval);

        const id = "test-id";

        weight = operationsPerCooldown * 3 - 1;
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);

        Sinon.clock.tick(cooldownInterval + 1);

        weight = 1
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation after ${cooldownInterval - 1}ms should still be throttled`);

        Sinon.clock.tick(cooldownInterval);

        weight = 1
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, false, `operation after ${cooldownInterval * 2 + 1}ms should not be throttled`);
    });

    it("throttles based on stored throttlingMetrics", async () => {
        const rate = 100;
        const cooldownInterval = 1000;
        let weight: number = 1;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleStorageManager();
        const throttler = new ThrottlerHelper(throttleStorageManager, rate, cooldownInterval);

        const id = "test-id";

        const now = Date.now();
        await throttleStorageManager.setThrottlingMetric(id, {
            count: 0 - weight,
            lastCoolDownAt: now,
            retryAfterInMs: cooldownInterval,
            throttleStatus: true,
            throttleReason: "Exceeded count by 1",
        });

        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, "operation after 0ms should be throttled");


        Sinon.clock.tick(cooldownInterval + 1);

        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, false, `operation after ${cooldownInterval + 1}ms should not be throttled`);
    });


    it("stores most recently calculated throttlingMetrics", async () => {
        const rate = 100;
        const cooldownInterval = 1000;
        const operationsPerCooldown = cooldownInterval / rate;
        let weight: number = operationsPerCooldown + 1;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleStorageManager();
        const throttler = new ThrottlerHelper(throttleStorageManager, rate, cooldownInterval);

        const id = "test-id";

        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);

        const cachedResponse = await throttler.getThrottleStatus(id);
        assert.deepStrictEqual(cachedResponse, response);
    });
    it("does not increase throttle duration while throttled", async () => {
        const rate = 100;
        const cooldownInterval = 1000;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleStorageManager();
        const operationsPerCooldown = cooldownInterval / rate;
        const throttler = new ThrottlerHelper(throttleStorageManager, rate, cooldownInterval);

        const id = "test-id";

        weight = operationsPerCooldown + 1;
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);

        // make sure potentially added throttle duration exceeds 1 cooldown interval
        weight = operationsPerCooldown * 2;
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, "operation after 0ms should be throttled");

        Sinon.clock.tick(cooldownInterval + 1);

        weight = 1;
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, false, `operation after ${cooldownInterval + 1}ms should not be throttled`);
    });

    it("gives accurate retryAfterInMs duration when only one cooldownInterval required", async () => {
        const rate = 100;
        const cooldownInterval = 1000;
        const operationsPerCooldown = cooldownInterval / rate;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleStorageManager();
        const throttler = new ThrottlerHelper(throttleStorageManager, rate, cooldownInterval);

        const id = "test-id";

        weight = operationsPerCooldown + 1;
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);

        const retryAfter = response.retryAfterInMs;
        // move 1 ms past retryAfter duration
        Sinon.clock.tick(retryAfter + 1);

        // should no longer be throttled
        weight = 0;
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, false, `operation after ${retryAfter}ms should not be throttled`);
    });

    it("gives accurate retryAfterInMs duration when more than one cooldownInterval required", async () => {
        const rate = 100;
        const cooldownInterval = 1000;
        const operationsPerCooldown = cooldownInterval / rate;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleStorageManager();
        const throttler = new ThrottlerHelper(throttleStorageManager, rate, cooldownInterval);

        const id = "test-id";

        weight = operationsPerCooldown * 3 + 1;
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);

        const retryAfter = response.retryAfterInMs;
        // move 1 ms past retryAfter duration
        Sinon.clock.tick(retryAfter + 1);

        // should no longer be throttled
        weight = 0;
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, false, `operation after ${retryAfter}ms should not be throttled`);
    });

    it("gives accurate retryAfterInMs duration when exactly two cooldownIntervals required", async () => {
        const rate = 100;
        const cooldownInterval = 1000;
        const operationsPerCooldown = cooldownInterval / rate;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleStorageManager();
        const throttler = new ThrottlerHelper(throttleStorageManager, rate, cooldownInterval);

        const id = "test-id";

        weight = operationsPerCooldown * 3;
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);

        const retryAfter = response.retryAfterInMs;
        // move 1 ms past retryAfter duration
        Sinon.clock.tick(retryAfter + 1);

        // should no longer be throttled
        weight = 0;
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, false, `operation after ${retryAfter}ms should not be throttled`);
    });

    it("gives minimum retryAfterInMs duration when only one cooldownInterval required", async () => {
        const rate = 100;
        const cooldownInterval = 1000;
        const operationsPerCooldown = cooldownInterval / rate;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleStorageManager();
        const throttler = new ThrottlerHelper(throttleStorageManager, rate, cooldownInterval);

        const id = "test-id";

        weight = operationsPerCooldown + 1;
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);

        const retryAfter = response.retryAfterInMs;
        // move to 1ms before end of retryAfter duration
        Sinon.clock.tick(retryAfter - 1);

        // should still be throttled
        weight = 0;
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation after ${retryAfter}ms should still be throttled`);
    });

    it("gives minimum retryAfterInMs duration when more than one cooldownInterval required", async () => {
        const rate = 100;
        const cooldownInterval = 1000;
        const operationsPerCooldown = cooldownInterval / rate;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleStorageManager();
        const throttler = new ThrottlerHelper(throttleStorageManager, rate, cooldownInterval);

        const id = "test-id";

        weight = operationsPerCooldown * 3 + 1;
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);

        const retryAfter = response.retryAfterInMs;
        // move to 1ms before end of retryAfter duration
        Sinon.clock.tick(retryAfter - 1);

        // should still be throttled
        weight = 0;
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation after ${retryAfter}ms should still be throttled`);
    });

    it("gives minimum retryAfterInMs duration when exactly two cooldownIntervals required", async () => {
        const rate = 100;
        const cooldownInterval = 1000;
        const operationsPerCooldown = cooldownInterval / rate;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleStorageManager();
        const throttler = new ThrottlerHelper(throttleStorageManager, rate, cooldownInterval);

        const id = "test-id";

        weight = operationsPerCooldown * 3;
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);

        const retryAfter = response.retryAfterInMs;
        // move to 1ms before end of retryAfter duration
        Sinon.clock.tick(retryAfter - 1);

        // should still be throttled
        weight = 0;
        response = await throttler.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation after ${retryAfter}ms should still be throttled`);
    });
});
