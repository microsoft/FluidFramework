/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { strict as assert } from "assert";
import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { loggerToMonitoringContext, MockLogger, sessionStorageConfigProvider, ConfigTypes } from "@fluidframework/telemetry-utils";
import { SinonFakeTimers, useFakeTimers } from "sinon";
import {
    SweepReadyUsageDetectionHandler,
} from "../gcSweepReadyUsageDetection";
import { oneDayMs } from "../garbageCollection";

describe("Garbage Collection Tests", () => {
    let clock: SinonFakeTimers;

    describe.only("SweepReady Usage Detection", () => {
        const sweepReadyUsageDetectionKey = "Fluid.GarbageCollection.Dogfood.SweepReadyUsageDetection";
        const blackoutPeriodDays = "Fluid.GarbageCollection.Dogfood.SweepReadyUsageDetection.BlackoutPeriodDays";
        const closuresStorageKey = "Fluid.GarbageCollection.Dogfood.SweepReadyUsageDetection.Closures";
        const sweepReadyUsageErrorType = "unreferencedObjectUsedAfterGarbageCollected";

        let mockLogger: MockLogger = new MockLogger();
        let closeErrors: (ICriticalContainerError)[] = [];
        // used to inject settings into MonitoringContext, and also to mock localStorage for the handler
        let mockLocalStorage: Record<string, ConfigTypes> = {};

        const createHandler = (uniqueContainerKey: string = "key1", forceNoopStorage: boolean = false) => new SweepReadyUsageDetectionHandler(
            uniqueContainerKey,
            loggerToMonitoringContext(mockLogger),
            (e) => { assert(e, "PRECONDITION: Only expected closure due to error"); closeErrors.push(e); },
            forceNoopStorage ? undefined : {
                getItem(key) {
                    const rawValue = mockLocalStorage[key];
                    switch (typeof rawValue) {
                        case "undefined":
                            return null;
                        case "string":
                            return rawValue;
                        default:
                            assert.fail("PRECONDITION: only strings allowed to be accessed via storage");
                    }
                },
                setItem(key, value) {
                    mockLocalStorage[key] = value;
                },
            },
        );

        const oldRawConfig = sessionStorageConfigProvider.value.getRawConfig;
        before(() => {
            clock = useFakeTimers();
            sessionStorageConfigProvider.value.getRawConfig = (name) => mockLocalStorage[name];
        });
        after(() => {
            clock.restore();
            sessionStorageConfigProvider.value.getRawConfig = oldRawConfig;
        });
        beforeEach(() => {
            mockLogger = new MockLogger();
            closeErrors = [];
        });
        afterEach(() => {
            clock.reset();
            mockLocalStorage = {};
        });

        describe("usageDetectedInMainContainer", () => {
            beforeEach(() => {
                // For these tests, enable these by default
                mockLocalStorage[sweepReadyUsageDetectionKey] = "blah mainContainer blah";
                mockLocalStorage[blackoutPeriodDays] = 1;
            });
            it("setting does not contain 'mainContainer' - do not close the container", () => {
                mockLocalStorage[sweepReadyUsageDetectionKey] = "summarizer or whatever";
                createHandler().usageDetectedInMainContainer({});
                assert.equal(closeErrors.length, 0, "Shouldn't close if setting doesn't include 'mainContainer'");
            });
            it("NoopStorage - close the container back-to-back", () => {
                const handler = createHandler("key1", true /* forceNoopStorage */);
                handler.usageDetectedInMainContainer({});
                handler.usageDetectedInMainContainer({});
                assert.equal(closeErrors.length, 2, `Should have closed back-to-back with noopStorage defined. errors:\n${closeErrors}`);
                assert(closeErrors.every((e) => e.errorType === sweepReadyUsageErrorType), `Expected all SweepReadyUsageErrors. errors:\n${closeErrors}`);
                mockLogger.assertMatch([{ eventName: "SweepReadyUsageDetectionHandlerNoOpStorage" }]);
            });
            it("BlackoutPeriod undefined - close the container back-to-back", () => {
                mockLocalStorage[blackoutPeriodDays] = undefined;
                const handler = createHandler();
                handler.usageDetectedInMainContainer({});
                handler.usageDetectedInMainContainer({});
                assert.equal(closeErrors.length, 2, `Should have closed back-to-back with no blackout period defined. errors:\n${closeErrors}`);
                assert(closeErrors.every((e) => e.errorType === sweepReadyUsageErrorType), `Expected all SweepReadyUsageErrors. errors:\n${closeErrors}`);
            });
            it("BlackoutPeriod set - don't close the container during that period", () => {
                const handler = createHandler();

                clock.tick(10);
                handler.usageDetectedInMainContainer({});
                assert.deepEqual(JSON.parse(mockLocalStorage[closuresStorageKey] as string), { key1: { lastCloseTime: 10 } });
                assert.equal(closeErrors.length, 1, `Expected to close the first time`);
                assert.equal(closeErrors[0]?.errorType ?? "", sweepReadyUsageErrorType, "Expected sweepReadyUsageErrorType the first time");

                clock.tick(10);
                handler.usageDetectedInMainContainer({});
                assert.equal(closeErrors.length, 1, `Should NOT have closed back-to-back due to blackout period. errors:\n${closeErrors}`);

                clock.tick(oneDayMs);
                handler.usageDetectedInMainContainer({});
                assert.equal(closeErrors.length, 2, `Expected to close again after waiting 1 day`);
                assert.equal(closeErrors[1]?.errorType ?? "", sweepReadyUsageErrorType, "Expected sweepReadyUsageErrorType the second time");
            });
            it("Multiple handlers/keys - closure blackouts are consistent and independent", () => {
                const handler1a = createHandler("key1");
                const handler1b = createHandler("key1");
                const handler2 = createHandler("key2");

                clock.tick(10);
                handler1a.usageDetectedInMainContainer({});
                assert.deepEqual(JSON.parse(mockLocalStorage[closuresStorageKey] as string), { key1: { lastCloseTime: 10 } });
                assert.equal(closeErrors.length, 1, `Expected to close the first time`);
                assert.equal(closeErrors[0]?.errorType ?? "", sweepReadyUsageErrorType, "Expected sweepReadyUsageErrorType the first time");

                // The other handler on key1 should be blocked
                clock.tick(10);
                handler1b.usageDetectedInMainContainer({});
                assert.equal(closeErrors.length, 1, `Should NOT have closed back-to-back due to blackout period. errors:\n${closeErrors}`);

                // But the handler on key2 should NOT be blocked
                handler2.usageDetectedInMainContainer({});
                assert.equal(closeErrors.length, 2, `Should have closed other container for the first time. errors:\n${closeErrors}`);

                clock.tick(oneDayMs + 10);
                handler1b.usageDetectedInMainContainer({});
                handler2.usageDetectedInMainContainer({});
                assert.equal(closeErrors.length, 4, `Expected both to close again after waiting 1 day`);
                assert(closeErrors.every((e) => e.errorType === sweepReadyUsageErrorType), `Expected all SweepReadyUsageErrors. errors:\n${closeErrors}`);
            });
            //* Test case for corrupted value in closure map (fail JSON.parse or succeed but have the wrong structure)
        });
    });
});
