/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IThrottlingMetrics } from "@fluidframework/server-services-core";
import { TestThrottleStorageManager } from "../testThrottleStorageManager";

describe("Test for Test Utils", () => {
    describe("ThrottleStorageManager", () => {
        it("Creates and retrieves throttlingMetric", async () => {
            const throttleManager = new TestThrottleStorageManager();

            const id = "test-id-1";
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
            const throttleManager = new TestThrottleStorageManager();

            const id = "test-id-2";
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
            const throttleManager = new TestThrottleStorageManager();

            const id = "test-id-2";

            const retrievedThrottlingMetric = await throttleManager.getThrottlingMetric(id);
            assert.strictEqual(retrievedThrottlingMetric, undefined);
        });
    });
});
