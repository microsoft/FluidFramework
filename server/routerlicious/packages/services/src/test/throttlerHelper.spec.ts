/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IThrottlerResponse } from "@fluidframework/server-services-core";
import { TestThrottleAndUsageStorageManager } from "@fluidframework/server-test-utils";
import { TestEngine1, Lumberjack } from "@fluidframework/server-services-telemetry";
import assert from "assert";
import Sinon from "sinon";
import { ThrottlerHelper } from "../throttlerHelper";

const lumberjackEngine = new TestEngine1();
if (!Lumberjack.isSetupCompleted()) {
    Lumberjack.setup([lumberjackEngine]);
}

describe("ThrottlerHelper", () => {
    beforeEach(() => {
        // use fake timers to have full control over the passage of time
        Sinon.useFakeTimers();
    });

    afterEach(() => {
        Sinon.restore();
    });

    it("throttles on many individual operations", async () => {
        const opsPerMs = 1;
        const opsBurstLimit = 10;
        const cooldownIntervalInMs = 10;
        const operationsPerCooldown = opsPerMs * cooldownIntervalInMs;
        let weight: number = 1;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleAndUsageStorageManager();
        const throttlerHelper = new ThrottlerHelper(throttleStorageManager, opsPerMs, opsBurstLimit, cooldownIntervalInMs);

        const id = "test-id";
        for (let i = 0; i < operationsPerCooldown; i++) {
            response = await throttlerHelper.updateCount(id, weight);
            assert.strictEqual(response.throttleStatus, false, `operation ${i + 1} should not be throttled`);
        }
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation ${operationsPerCooldown + 1} should be throttled`);
    });

    it("throttles on a few operation batches", async () => {
        const opsPerMs = 1;
        const opsBurstLimit = 10;
        const cooldownIntervalInMs = 10;
        const operationsPerCooldown = opsPerMs * cooldownIntervalInMs;
        let weight: number = 2;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleAndUsageStorageManager();
        const throttlerHelper = new ThrottlerHelper(throttleStorageManager, opsPerMs, opsBurstLimit, cooldownIntervalInMs);

        const id = "test-id";
        for (let i = 0; i < operationsPerCooldown / weight; i++) {
            response = await throttlerHelper.updateCount(id, weight)
            assert.strictEqual(response.throttleStatus, false, `operation ${i + 1} should not be throttled`);
        }
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation ${operationsPerCooldown / weight + 1} should be throttled`);
    });

    it("throttles on one operation batch", async () => {
        const opsPerMs = 1;
        const opsBurstLimit = 10;
        const cooldownIntervalInMs = 10;
        const operationsPerCooldown = opsPerMs * cooldownIntervalInMs;
        let weight: number = operationsPerCooldown + 1;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleAndUsageStorageManager();
        const throttlerHelper = new ThrottlerHelper(throttleStorageManager, opsPerMs, opsBurstLimit, cooldownIntervalInMs);

        const id = "test-id";

        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);
    });

    it("un-throttles after cooldown", async () => {
        const opsPerMs = 1;
        const opsBurstLimit = 10;
        const cooldownIntervalInMs = 10;
        const operationsPerCooldown = opsPerMs * cooldownIntervalInMs;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleAndUsageStorageManager();
        const throttlerHelper = new ThrottlerHelper(throttleStorageManager, opsPerMs, opsBurstLimit, cooldownIntervalInMs);

        const id = "test-id";

        weight = operationsPerCooldown * 2 - 1;
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);

        Sinon.clock.tick(cooldownIntervalInMs + 1);

        weight = 1
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, false, `operation after ${cooldownIntervalInMs + 1}ms should not be throttled`);
    });

    it("un-throttles after double cooldown", async () => {
        const opsPerMs = 1;
        const opsBurstLimit = 10;
        const cooldownIntervalInMs = 10;
        const operationsPerCooldown = opsPerMs * cooldownIntervalInMs;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleAndUsageStorageManager();
        const throttlerHelper = new ThrottlerHelper(throttleStorageManager, opsPerMs, opsBurstLimit, cooldownIntervalInMs);

        const id = "test-id";

        weight = operationsPerCooldown * 3 - 1;
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);

        Sinon.clock.tick(cooldownIntervalInMs + 1);

        weight = 1
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation after ${cooldownIntervalInMs - 1}ms should still be throttled`);

        Sinon.clock.tick(cooldownIntervalInMs);

        weight = 1
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, false, `operation after ${cooldownIntervalInMs * 2 + 1}ms should not be throttled`);
    });

    it("throttles based on stored throttlingMetrics", async () => {
        const opsPerMs = 1;
        const opsBurstLimit = 10;
        const cooldownIntervalInMs = 10;
        let weight: number = 1;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleAndUsageStorageManager();
        const throttlerHelper = new ThrottlerHelper(throttleStorageManager, opsPerMs, opsBurstLimit, cooldownIntervalInMs);

        const id = "test-id";

        const now = Date.now();
        await throttleStorageManager.setThrottlingMetric(id, {
            count: 0 - weight,
            lastCoolDownAt: now,
            retryAfterInMs: cooldownIntervalInMs,
            throttleStatus: true,
            throttleReason: "Exceeded count by 1",
        });

        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, "operation after 0ms should be throttled");


        Sinon.clock.tick(cooldownIntervalInMs + 1);

        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, false, `operation after ${cooldownIntervalInMs + 1}ms should not be throttled`);
    });


    it("stores most recently calculated throttlingMetrics", async () => {
        const opsPerMs = 1;
        const opsBurstLimit = 10;
        const cooldownIntervalInMs = 10;
        const operationsPerCooldown = opsPerMs * cooldownIntervalInMs;
        let weight: number = operationsPerCooldown + 1;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleAndUsageStorageManager();
        const throttlerHelper = new ThrottlerHelper(throttleStorageManager, opsPerMs, opsBurstLimit, cooldownIntervalInMs);

        const id = "test-id";

        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);

        const cachedResponse = await throttlerHelper.getThrottleStatus(id);
        assert.deepStrictEqual(cachedResponse, response);
    });
    it("does not increase throttle duration while throttled", async () => {
        const opsPerMs = 1;
        const opsBurstLimit = 10;
        const cooldownIntervalInMs = 10;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleAndUsageStorageManager();
        const operationsPerCooldown = opsPerMs * cooldownIntervalInMs;
        const throttlerHelper = new ThrottlerHelper(throttleStorageManager, opsPerMs, opsBurstLimit, cooldownIntervalInMs);

        const id = "test-id";

        weight = operationsPerCooldown + 1;
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);

        // make sure potentially added throttle duration exceeds 1 cooldown interval
        weight = operationsPerCooldown * 2;
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, "operation after 0ms should be throttled");

        Sinon.clock.tick(cooldownIntervalInMs + 1);

        weight = 1;
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, false, `operation after ${cooldownIntervalInMs + 1}ms should not be throttled`);
    });

    it("gives accurate retryAfterInMs duration when only one cooldownIntervalInMs required", async () => {
        const opsPerMs = 1;
        const opsBurstLimit = 10;
        const cooldownIntervalInMs = 10;
        const operationsPerCooldown = opsPerMs * cooldownIntervalInMs;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleAndUsageStorageManager();
        const throttlerHelper = new ThrottlerHelper(throttleStorageManager, opsPerMs, opsBurstLimit, cooldownIntervalInMs);

        const id = "test-id";

        weight = operationsPerCooldown + 1;
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);

        const retryAfter = response.retryAfterInMs;
        // move 1 ms past retryAfter duration
        Sinon.clock.tick(retryAfter + 1);

        // should no longer be throttled
        weight = 0;
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, false, `operation after ${retryAfter}ms should not be throttled`);
    });

    it("gives accurate retryAfterInMs duration when more than one cooldownIntervalInMs required", async () => {
        const opsPerMs = 1;
        const opsBurstLimit = 10;
        const cooldownIntervalInMs = 10;
        const operationsPerCooldown = opsPerMs * cooldownIntervalInMs;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleAndUsageStorageManager();
        const throttlerHelper = new ThrottlerHelper(throttleStorageManager, opsPerMs, opsBurstLimit, cooldownIntervalInMs);

        const id = "test-id";

        weight = operationsPerCooldown * 3 + 1;
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);

        const retryAfter = response.retryAfterInMs;
        // move 1 ms past retryAfter duration
        Sinon.clock.tick(retryAfter + 1);

        // should no longer be throttled
        weight = 0;
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, false, `operation after ${retryAfter}ms should not be throttled`);
    });

    it("gives accurate retryAfterInMs duration when exactly two cooldownIntervalInMss required", async () => {
        const opsPerMs = 1;
        const opsBurstLimit = 10;
        const cooldownIntervalInMs = 10;
        const operationsPerCooldown = opsPerMs * cooldownIntervalInMs;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleAndUsageStorageManager();
        const throttlerHelper = new ThrottlerHelper(throttleStorageManager, opsPerMs, opsBurstLimit, cooldownIntervalInMs);

        const id = "test-id";

        weight = operationsPerCooldown * 3;
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);

        const retryAfter = response.retryAfterInMs;
        // move 1 ms past retryAfter duration
        Sinon.clock.tick(retryAfter + 1);

        // should no longer be throttled
        weight = 0;
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, false, `operation after ${retryAfter}ms should not be throttled`);
    });

    it("gives minimum retryAfterInMs duration when only one cooldownIntervalInMs required", async () => {
        const opsPerMs = 1;
        const opsBurstLimit = 10;
        const cooldownIntervalInMs = 10;
        const operationsPerCooldown = opsPerMs * cooldownIntervalInMs;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleAndUsageStorageManager();
        const throttlerHelper = new ThrottlerHelper(throttleStorageManager, opsPerMs, opsBurstLimit, cooldownIntervalInMs);

        const id = "test-id";

        weight = operationsPerCooldown + 1;
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);

        const retryAfter = response.retryAfterInMs;
        // move to 1ms before end of retryAfter duration
        Sinon.clock.tick(retryAfter - 1);

        // should still be throttled
        weight = 0;
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation after ${retryAfter}ms should still be throttled`);
    });

    it("gives minimum retryAfterInMs duration when more than one cooldownIntervalInMs required", async () => {
        const opsPerMs = 1;
        const opsBurstLimit = 10;
        const cooldownIntervalInMs = 10;
        const operationsPerCooldown = opsPerMs * cooldownIntervalInMs;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleAndUsageStorageManager();
        const throttlerHelper = new ThrottlerHelper(throttleStorageManager, opsPerMs, opsBurstLimit, cooldownIntervalInMs);

        const id = "test-id";

        weight = operationsPerCooldown * 3 + 1;
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);

        const retryAfter = response.retryAfterInMs;
        // move to 1ms before end of retryAfter duration
        Sinon.clock.tick(retryAfter - 1);

        // should still be throttled
        weight = 0;
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation after ${retryAfter}ms should still be throttled`);
    });

    it("gives minimum retryAfterInMs duration when exactly two cooldownIntervalInMss required", async () => {
        const opsPerMs = 1;
        const opsBurstLimit = 10;
        const cooldownIntervalInMs = 10;
        const operationsPerCooldown = opsPerMs * cooldownIntervalInMs;
        let weight: number;
        let response: IThrottlerResponse;
        const throttleStorageManager = new TestThrottleAndUsageStorageManager();
        const throttlerHelper = new ThrottlerHelper(throttleStorageManager, opsPerMs, opsBurstLimit, cooldownIntervalInMs);

        const id = "test-id";

        weight = operationsPerCooldown * 3;
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);

        const retryAfter = response.retryAfterInMs;
        // move to 1ms before end of retryAfter duration
        Sinon.clock.tick(retryAfter - 1);

        // should still be throttled
        weight = 0;
        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation after ${retryAfter}ms should still be throttled`);
    });

    it("returns undefined when trying to retrieve unknown throttleStatus", async () => {
        const opsPerMs = 1;
        const opsBurstLimit = 10;
        const cooldownIntervalInMs = 10;
        const throttleStorageManager = new TestThrottleAndUsageStorageManager();
        const throttlerHelper = new ThrottlerHelper(throttleStorageManager, opsPerMs, opsBurstLimit, cooldownIntervalInMs);

        const id = "test-id";

        await assert.doesNotReject(throttlerHelper.getThrottleStatus(id));
    });

    it("does not allow operation burst to exceed operation burst limit", async () => {
        const opsPerMs = 1;
        const opsBurstLimit = 10;
        const cooldownIntervalInMs = 10;
        const operationsPerCooldown = opsPerMs * cooldownIntervalInMs;
        const throttleStorageManager = new TestThrottleAndUsageStorageManager();
        const throttlerHelper = new ThrottlerHelper(throttleStorageManager, opsPerMs, opsBurstLimit, cooldownIntervalInMs);

        let response: IThrottlerResponse;
        const weight: number = operationsPerCooldown + 1;
        const id = "test-id";

        response = await throttlerHelper.updateCount(id, weight);
        assert.strictEqual(response.throttleStatus, true, `operation with ${weight - operationsPerCooldown} excess weight should be throttled`);

        const timeToFillOperationBurst = opsBurstLimit / opsPerMs;
        // try to overfill token bucket
        Sinon.clock.tick(timeToFillOperationBurst * 2);

        response = await throttlerHelper.updateCount(id, opsBurstLimit + 1);
        assert.strictEqual(response.throttleStatus, true, `operation with ${opsBurstLimit - operationsPerCooldown} excess weight should be throttled`);
    });
});
