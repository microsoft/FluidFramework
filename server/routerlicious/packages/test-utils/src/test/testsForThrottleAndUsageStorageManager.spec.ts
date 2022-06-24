/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IThrottlingMetrics, IUsageData } from "@fluidframework/server-services-core";
import { TestThrottleAndUsageStorageManager } from "../testThrottleAndUsageStorageManager";

describe("Test for Test Utils", () => {
    describe("ThrottleAndUsageStorageManager", () => {
        it("Creates and retrieves throttlingMetric", async () => {
            const throttleManager = new TestThrottleAndUsageStorageManager();

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
            const throttleManager = new TestThrottleAndUsageStorageManager();

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
            const throttleManager = new TestThrottleAndUsageStorageManager();

            const id = "test-id-2";

            const retrievedThrottlingMetric = await throttleManager.getThrottlingMetric(id);
            assert.strictEqual(retrievedThrottlingMetric, undefined);
        });

        it("Creates and retrieves throttlingMetric and usageData", async () => {
            const throttleManager = new TestThrottleAndUsageStorageManager();

            const id = "test-id-1";
            const throttlingMetric: IThrottlingMetrics = {
                count: 2,
                lastCoolDownAt: Date.now(),
                throttleStatus: false,
                throttleReason: "N/A",
                retryAfterInMs: 2500,
            };

            const usageId = "test-id-2";
            const usageData: IUsageData = {
                value: 2,
                tenantId: "testTenant",
                documentId: "testDocument",
            };

            await throttleManager.setThrottlingMetricAndUsageData(
                id,
                throttlingMetric,
                usageId,
                usageData);

            const retrievedThrottlingMetric = await throttleManager.getThrottlingMetric(id);
            assert.deepStrictEqual(retrievedThrottlingMetric, throttlingMetric);
            const retrievedUsageData = await throttleManager.getUsageData(usageId);
            assert.deepStrictEqual(retrievedUsageData, usageData);
        });

        it("Creates and retrieves usageData", async () => {
            const throttleManager = new TestThrottleAndUsageStorageManager();

            const usageId = "test-id-1";
            const usageData: IUsageData = {
                value: 2,
                tenantId: "testTenant",
                documentId: "testDocument",
            };

            await throttleManager.setUsageData(usageId, usageData);

            const retrievedUsageData = await throttleManager.getUsageData(usageId);
            assert.deepStrictEqual(retrievedUsageData, usageData);
        });
    });
});
