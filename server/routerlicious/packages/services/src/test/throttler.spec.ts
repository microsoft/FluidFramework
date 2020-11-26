/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IThrottlerResponse, ThrottlerRequestType } from "@fluidframework/server-services-core";
import { TestThrottleManager } from "@fluidframework/server-test-utils";
import assert from "assert";
import Sinon from "sinon";
import { Throttler } from "../throttler";

describe("Throttler", () => {
    beforeEach(() => {
        // use fake timers to have full control over the passage of time
        Sinon.useFakeTimers();
    });

    afterEach(() => {
        Sinon.restore();
    });

    it("throttles on many individual requests", async () => {
        const requestRate = 100;
        const cooldownInterval = 1000;
        const requestsPerCooldown = cooldownInterval / requestRate;
        let weight: number = 1;
        let response: IThrottlerResponse;
        const throttleManager = new TestThrottleManager();
        const throttler = new Throttler(throttleManager, requestRate, cooldownInterval);

        const id = "test-id";
        const requestType = ThrottlerRequestType.SubmitOp;
        for (let i = 0; i < requestsPerCooldown; i++) {
            response = await throttler.updateRequestCount(id, requestType, weight);
            assert.strictEqual(response.throttleStatus, false, `request ${i + 1} should not be throttled`);
        }
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, true, `request ${requestsPerCooldown + 1} should be throttled`);
    });

    it("throttles on a few request batches", async () => {
        const requestRate = 100;
        const cooldownInterval = 1000;
        const requestsPerCooldown = cooldownInterval / requestRate;
        let weight: number = 2;
        let response: IThrottlerResponse;
        const throttleManager = new TestThrottleManager();
        const throttler = new Throttler(throttleManager, requestRate, cooldownInterval);

        const id = "test-id";
        const requestType = ThrottlerRequestType.SubmitOp;
        for (let i = 0; i < requestsPerCooldown / weight; i++) {
            response = await throttler.updateRequestCount(id, requestType, weight)
            assert.strictEqual(response.throttleStatus, false, `request ${i + 1} should not be throttled`);
        }
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, true, `request ${requestsPerCooldown / weight + 1} should be throttled`);
    });

    it("throttles on one request batch", async () => {
        const requestRate = 100;
        const cooldownInterval = 1000;
        const requestsPerCooldown = cooldownInterval / requestRate;
        let weight: number = requestsPerCooldown + 1;
        let response: IThrottlerResponse;
        const throttleManager = new TestThrottleManager();
        const throttler = new Throttler(throttleManager, requestRate, cooldownInterval);

        const id = "test-id";
        const requestType = ThrottlerRequestType.SubmitOp;

        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, true, `request with ${weight - requestsPerCooldown} excess weight should be throttled`);
    });

    it("un-throttles after cooldown", async () => {
        const requestRate = 100;
        const cooldownInterval = 1000;
        const requestsPerCooldown = cooldownInterval / requestRate;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleManager = new TestThrottleManager();
        const throttler = new Throttler(throttleManager, requestRate, cooldownInterval);

        const id = "test-id";
        const requestType = ThrottlerRequestType.SubmitOp;

        weight = requestsPerCooldown * 2 - 1;
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, true, `request with ${weight - requestsPerCooldown} excess weight should be throttled`);

        Sinon.clock.tick(cooldownInterval + 1);

        weight = 1
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, false, `request after ${cooldownInterval + 1}ms should not be throttled`);
    });

    it("un-throttles after double cooldown", async () => {
        const requestRate = 100;
        const cooldownInterval = 1000;
        const requestsPerCooldown = cooldownInterval / requestRate;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleManager = new TestThrottleManager();
        const throttler = new Throttler(throttleManager, requestRate, cooldownInterval);

        const id = "test-id";
        const requestType = ThrottlerRequestType.SubmitOp;

        weight = requestsPerCooldown * 3 - 1;
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, true, `request with ${weight - requestsPerCooldown} excess weight should be throttled`);

        Sinon.clock.tick(cooldownInterval + 1);

        weight = 1
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, true, `request after ${cooldownInterval - 1}ms should still be throttled`);

        Sinon.clock.tick(cooldownInterval);

        weight = 1
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, false, `request after ${cooldownInterval * 2 + 1}ms should not be throttled`);
    });

    it("throttles based on stored requestMetrics", async () => {
        const requestRate = 100;
        const cooldownInterval = 1000;
        let weight: number = 1;
        let response: IThrottlerResponse;
        const throttleManager = new TestThrottleManager();
        const throttler = new Throttler(throttleManager, requestRate, cooldownInterval);

        const id = "test-id";
        const requestType = ThrottlerRequestType.SubmitOp;

        const now = Date.now();
        await throttleManager.setRequestMetric(id, requestType, {
            count: 0 - weight,
            lastCoolDownAt: now,
            retryAfterInMs: cooldownInterval,
            throttleStatus: true,
            throttleReason: "Exceeded count by 1",
        });

        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, true, "request after 0ms should be throttled");


        Sinon.clock.tick(cooldownInterval + 1);

        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, false, `request after ${cooldownInterval + 1}ms should not be throttled`);
    });


    it("stores most recently calculated requestMetrics", async () => {
        const requestRate = 100;
        const cooldownInterval = 1000;
        const requestsPerCooldown = cooldownInterval / requestRate;
        let weight: number = requestsPerCooldown + 1;
        let response: IThrottlerResponse;
        const throttleManager = new TestThrottleManager();
        const throttler = new Throttler(throttleManager, requestRate, cooldownInterval);

        const id = "test-id";
        const requestType = ThrottlerRequestType.SubmitOp;

        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, true, `request with ${weight - requestsPerCooldown} excess weight should be throttled`);

        const cachedResponse = await throttler.getThrottleStatus(id, requestType);
        assert.deepStrictEqual(cachedResponse, response);
    });
    it("does not increase throttle duration while throttled", async () => {
        const requestRate = 100;
        const cooldownInterval = 1000;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleManager = new TestThrottleManager();
        const requestsPerCooldown = cooldownInterval / requestRate;
        const throttler = new Throttler(throttleManager, requestRate, cooldownInterval);

        const id = "test-id";
        const requestType = ThrottlerRequestType.SubmitOp;

        weight = requestsPerCooldown + 1;
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, true, `request with ${weight - requestsPerCooldown} excess weight should be throttled`);

        // make sure potentially added throttle duration exceeds 1 cooldown interval
        weight = requestsPerCooldown * 2;
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, true, "request after 0ms should be throttled");

        Sinon.clock.tick(cooldownInterval + 1);

        weight = 1;
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, false, `request after ${cooldownInterval + 1}ms should not be throttled`);
    });

    it("gives accurate retryAfterInMs duration when only one cooldownInterval required", async () => {
        const requestRate = 100;
        const cooldownInterval = 1000;
        const requestsPerCooldown = cooldownInterval / requestRate;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleManager = new TestThrottleManager();
        const throttler = new Throttler(throttleManager, requestRate, cooldownInterval);

        const id = "test-id";
        const requestType = ThrottlerRequestType.SubmitOp;

        weight = requestsPerCooldown + 1;
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, true, `request with ${weight - requestsPerCooldown} excess weight should be throttled`);

        const retryAfter = response.retryAfterInMs;
        // move 1 ms past retryAfter duration
        Sinon.clock.tick(retryAfter + 1);

        // should no longer be throttled
        weight = 0;
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, false, `request after ${retryAfter}ms should not be throttled`);
    });

    it("gives accurate retryAfterInMs duration when more than one cooldownInterval required", async () => {
        const requestRate = 100;
        const cooldownInterval = 1000;
        const requestsPerCooldown = cooldownInterval / requestRate;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleManager = new TestThrottleManager();
        const throttler = new Throttler(throttleManager, requestRate, cooldownInterval);

        const id = "test-id";
        const requestType = ThrottlerRequestType.SubmitOp;

        weight = requestsPerCooldown * 3 + 1;
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, true, `request with ${weight - requestsPerCooldown} excess weight should be throttled`);

        const retryAfter = response.retryAfterInMs;
        // move 1 ms past retryAfter duration
        Sinon.clock.tick(retryAfter + 1);

        // should no longer be throttled
        weight = 0;
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, false, `request after ${retryAfter}ms should not be throttled`);
    });

    it("gives accurate retryAfterInMs duration when exactly two cooldownIntervals required", async () => {
        const requestRate = 100;
        const cooldownInterval = 1000;
        const requestsPerCooldown = cooldownInterval / requestRate;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleManager = new TestThrottleManager();
        const throttler = new Throttler(throttleManager, requestRate, cooldownInterval);

        const id = "test-id";
        const requestType = ThrottlerRequestType.SubmitOp;

        weight = requestsPerCooldown * 3;
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, true, `request with ${weight - requestsPerCooldown} excess weight should be throttled`);

        const retryAfter = response.retryAfterInMs;
        // move 1 ms past retryAfter duration
        Sinon.clock.tick(retryAfter + 1);

        // should no longer be throttled
        weight = 0;
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, false, `request after ${retryAfter}ms should not be throttled`);
    });

    it("gives minimum retryAfterInMs duration when only one cooldownInterval required", async () => {
        const requestRate = 100;
        const cooldownInterval = 1000;
        const requestsPerCooldown = cooldownInterval / requestRate;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleManager = new TestThrottleManager();
        const throttler = new Throttler(throttleManager, requestRate, cooldownInterval);

        const id = "test-id";
        const requestType = ThrottlerRequestType.SubmitOp;

        weight = requestsPerCooldown + 1;
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, true, `request with ${weight - requestsPerCooldown} excess weight should be throttled`);

        const retryAfter = response.retryAfterInMs;
        // move to 1ms before end of retryAfter duration
        Sinon.clock.tick(retryAfter - 1);

        // should still be throttled
        weight = 0;
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, true, `request after ${retryAfter}ms should still be throttled`);
    });

    it("gives minimum retryAfterInMs duration when more than one cooldownInterval required", async () => {
        const requestRate = 100;
        const cooldownInterval = 1000;
        const requestsPerCooldown = cooldownInterval / requestRate;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleManager = new TestThrottleManager();
        const throttler = new Throttler(throttleManager, requestRate, cooldownInterval);

        const id = "test-id";
        const requestType = ThrottlerRequestType.SubmitOp;

        weight = requestsPerCooldown * 3 + 1;
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, true, `request with ${weight - requestsPerCooldown} excess weight should be throttled`);

        const retryAfter = response.retryAfterInMs;
        // move to 1ms before end of retryAfter duration
        Sinon.clock.tick(retryAfter - 1);

        // should still be throttled
        weight = 0;
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, true, `request after ${retryAfter}ms should still be throttled`);
    });

    it("gives minimum retryAfterInMs duration when exactly two cooldownIntervals required", async () => {
        const requestRate = 100;
        const cooldownInterval = 1000;
        const requestsPerCooldown = cooldownInterval / requestRate;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleManager = new TestThrottleManager();
        const throttler = new Throttler(throttleManager, requestRate, cooldownInterval);

        const id = "test-id";
        const requestType = ThrottlerRequestType.SubmitOp;

        weight = requestsPerCooldown * 3;
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, true, `request with ${weight - requestsPerCooldown} excess weight should be throttled`);

        const retryAfter = response.retryAfterInMs;
        // move to 1ms before end of retryAfter duration
        Sinon.clock.tick(retryAfter - 1);

        // should still be throttled
        weight = 0;
        response = await throttler.updateRequestCount(id, requestType, weight);
        assert.strictEqual(response.throttleStatus, true, `request after ${retryAfter}ms should still be throttled`);
    });

    it("throttles one id, but not another with same requestType", async () => {
        const requestRate = 100;
        const cooldownInterval = 1000;
        const requestsPerCooldown = cooldownInterval / requestRate;
        let weight: number = requestsPerCooldown + 1;
        let response: IThrottlerResponse;
        const throttleManager = new TestThrottleManager();
        const throttler = new Throttler(throttleManager, requestRate, cooldownInterval);

        const id1 = "test-id-1";
        const id2 = "test-id-2";
        const requestType = ThrottlerRequestType.SubmitOp;

        response = await throttler.updateRequestCount(id1, requestType, weight);
        assert.strictEqual(response.throttleStatus, true, `request for ${id1} with ${weight - requestsPerCooldown} excess weight should be throttled`);

        response = await throttler.updateRequestCount(id2, requestType, weight - 1);
        assert.strictEqual(response.throttleStatus, false, `request for ${id2} with ${requestsPerCooldown - weight} spare weight should not be throttled`);
    });

    it("throttles one requestType, but not another with same id", async () => {
        const requestRate = 100;
        const cooldownInterval = 1000;
        const requestsPerCooldown = cooldownInterval / requestRate;
        let weight: number = requestsPerCooldown + 1;
        let response: IThrottlerResponse;
        const throttleManager = new TestThrottleManager();
        const throttler = new Throttler(throttleManager, requestRate, cooldownInterval);

        const id = "test-id";
        const requestType1 = ThrottlerRequestType.SubmitOp;
        const requestType2 = ThrottlerRequestType.OpenSocketConn;

        response = await throttler.updateRequestCount(id, requestType1, weight);
        assert.strictEqual(response.throttleStatus, true, `request for type ${requestType1} with ${weight - requestsPerCooldown} excess weight should be throttled`);

        response = await throttler.updateRequestCount(id, requestType2, weight - 1);
        assert.strictEqual(response.throttleStatus, false, `request for type ${requestType2} with ${requestsPerCooldown - weight} spare weight should not be throttled`);
    });
});
