/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IRequestMetrics } from "@fluidframework/server-services-core";
import { TestThrottleStorageManager } from "../testThrottleStorageManager";

describe("Test for Test Utils", () => {
    describe("ThrottleManager", () => {
        it("Creates and retrieves requestMetric", async () => {
            const throttleManager = new TestThrottleStorageManager();

            const id = "test-id-1";
            const requestMetric: IRequestMetrics = {
                count: 2,
                lastCoolDownAt: Date.now(),
                throttleStatus: false,
                throttleReason: "N/A",
                retryAfterInMs: 2500,
            };

            await throttleManager.setRequestMetric(id, requestMetric);
            const retrievedRequestMetric = await throttleManager.getRequestMetric(id);
            assert.deepStrictEqual(retrievedRequestMetric, requestMetric);
        });

        it("Creates and overwrites requestMetric", async () => {
            const throttleManager = new TestThrottleStorageManager();

            const id = "test-id-2";
            const originalRequestMetric: IRequestMetrics = {
                count: 2,
                lastCoolDownAt: Date.now(),
                throttleStatus: false,
                throttleReason: "N/A",
                retryAfterInMs: 0,
            };

            await throttleManager.setRequestMetric(id, originalRequestMetric);
            const retrievedRequestMetric = await throttleManager.getRequestMetric(id);
            assert.deepStrictEqual(retrievedRequestMetric, originalRequestMetric);

            const updatedRequestMetric: IRequestMetrics = {
                count: 0,
                lastCoolDownAt: Date.now(),
                throttleStatus: true,
                throttleReason: "Exceeded token count: Wait 5 seconds",
                retryAfterInMs: 5000,
            };
            await throttleManager.setRequestMetric(id, updatedRequestMetric);
            const retrievedUpdatedRequestMetric = await throttleManager.getRequestMetric(id);
            assert.deepStrictEqual(retrievedUpdatedRequestMetric, updatedRequestMetric);
        });

        it("Returns undefined when requestMetric does not exist", async () => {
            const throttleManager = new TestThrottleStorageManager();

            const id = "test-id-2";

            const retrievedRequestMetric = await throttleManager.getRequestMetric(id);
            assert.strictEqual(retrievedRequestMetric, undefined);
        });
    });
});
