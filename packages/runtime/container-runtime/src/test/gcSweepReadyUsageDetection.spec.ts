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
    skipClosureForXDaysKey,
    closuresMapLocalStorageKey,
    SweepReadyUsageDetectionHandler,
} from "../gcSweepReadyUsageDetection";
import { oneDayMs } from "../garbageCollection";

describe("Garbage Collection Tests", () => {
    let clock: SinonFakeTimers;

    describe("SweepReady Usage Detection", () => {
        const sweepReadyUsageDetectionKey = "Fluid.GarbageCollection.Dogfood.SweepReadyUsageDetection";
        const sweepReadyUsageErrorType = "garbageObjectUsedError";

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

        describe("usageDetectedIninteractiveClient", () => {
            beforeEach(() => {
                // For these tests, enable these by default
                mockLocalStorage[sweepReadyUsageDetectionKey] = "blah interactiveClientClose blah";
                mockLocalStorage[skipClosureForXDaysKey] = 1;
            });
            it("setting does not contain 'interactiveClientClose' - do not close the container", () => {
                mockLocalStorage[sweepReadyUsageDetectionKey] = "summarizer or whatever";
                createHandler().usageDetectedInInteractiveClient("Changed", {});
                assert.equal(closeErrors.length, 0, "Shouldn't close if setting doesn't include 'interactiveClientClose'");
            });
            it("NoopStorage - close the container back-to-back", () => {
                const handler = createHandler("key1", true /* forceNoopStorage */);
                handler.usageDetectedInInteractiveClient("Changed", {});
                handler.usageDetectedInInteractiveClient("Changed", {});
                assert.equal(closeErrors.length, 2, `Should have closed back-to-back with noopStorage defined. errors:\n${closeErrors}`);
                assert(closeErrors.every((e) => e.errorType === sweepReadyUsageErrorType), `Expected all SweepReadyUsageErrors. errors:\n${closeErrors}`);
                mockLogger.assertMatch([{ eventName: "SweepReadyUsageDetectionHandlerNoopStorage" }]);
            });
            it("SkipClosure Period undefined - close the container back-to-back", () => {
                mockLocalStorage[skipClosureForXDaysKey] = undefined;
                const handler = createHandler();
                handler.usageDetectedInInteractiveClient("Changed", {});
                handler.usageDetectedInInteractiveClient("Changed", {});
                assert.equal(closeErrors.length, 2, `Should have closed back-to-back with no Skip Closure Period defined. errors:\n${closeErrors}`);
                assert(closeErrors.every((e) => e.errorType === sweepReadyUsageErrorType), `Expected all SweepReadyUsageErrors. errors:\n${closeErrors}`);
            });
            it("SkipClosure Period set - don't close the container during that period", () => {
                const handler = createHandler();

                clock.tick(10);
                handler.usageDetectedInInteractiveClient("Changed", {});
                assert.deepEqual(JSON.parse(mockLocalStorage[closuresMapLocalStorageKey] as string), { key1: { lastCloseTime: 10 } });
                assert.equal(closeErrors.length, 1, `Expected to close the first time`);
                assert.equal(closeErrors[0]?.errorType ?? "", sweepReadyUsageErrorType, "Expected sweepReadyUsageErrorType the first time");

                clock.tick(10);
                handler.usageDetectedInInteractiveClient("Changed", {});
                assert.equal(closeErrors.length, 1, `Should NOT have closed back-to-back due to Skip Closure Period. errors:\n${closeErrors}`);

                clock.tick(oneDayMs);
                handler.usageDetectedInInteractiveClient("Changed", {});
                assert.equal(closeErrors.length, 2, `Expected to close again after waiting 1 day`);
                assert.equal(closeErrors[1]?.errorType ?? "", sweepReadyUsageErrorType, "Expected sweepReadyUsageErrorType the second time");
            });
            it("Multiple handlers/keys - closure skipping is consistent and independent", () => {
                const handler1a = createHandler("key1");
                const handler1b = createHandler("key1");
                const handler2 = createHandler("key2");

                clock.tick(10);
                handler1a.usageDetectedInInteractiveClient("Changed", {});
                assert.deepEqual(JSON.parse(mockLocalStorage[closuresMapLocalStorageKey] as string), { key1: { lastCloseTime: 10 } });
                assert.equal(closeErrors.length, 1, `Expected to close the first time`);
                assert.equal(closeErrors[0]?.errorType ?? "", sweepReadyUsageErrorType, "Expected sweepReadyUsageErrorType the first time");

                // The other handler on key1 should be blocked
                clock.tick(10);
                handler1b.usageDetectedInInteractiveClient("Changed", {});
                assert.equal(closeErrors.length, 1, `Should NOT have closed back-to-back due to Skip Closure Period. errors:\n${closeErrors}`);

                // But the handler on key2 should NOT be blocked
                handler2.usageDetectedInInteractiveClient("Changed", {});
                assert.equal(closeErrors.length, 2, `Should have closed other container for the first time. errors:\n${closeErrors}`);

                clock.tick(oneDayMs + 10);
                handler1b.usageDetectedInInteractiveClient("Changed", {});
                handler2.usageDetectedInInteractiveClient("Changed", {});
                assert.equal(closeErrors.length, 4, `Expected both to close again after waiting 1 day`);
                assert(closeErrors.every((e) => e.errorType === sweepReadyUsageErrorType), `Expected all SweepReadyUsageErrors. errors:\n${closeErrors}`);
            });
            it("Invalid JSON format closure map value in localStorage - recovers and respects the Skip Closure Period", () => {
                const handler = createHandler();
                mockLocalStorage[closuresMapLocalStorageKey] = "} Invalid JSON";

                clock.tick(10);
                handler.usageDetectedInInteractiveClient("Changed", {});
                assert.deepEqual(JSON.parse(mockLocalStorage[closuresMapLocalStorageKey] as string), { key1: { lastCloseTime: 10 } });
                assert.equal(closeErrors.length, 1, `Expected to close the first time`);
                assert.equal(closeErrors[0]?.errorType ?? "", sweepReadyUsageErrorType, "Expected sweepReadyUsageErrorType the first time");

                clock.tick(10);
                handler.usageDetectedInInteractiveClient("Changed", {});
                assert.equal(closeErrors.length, 1, `Should NOT have closed back-to-back due to Skip Closure Period. errors:\n${closeErrors}`);

                clock.tick(oneDayMs);
                handler.usageDetectedInInteractiveClient("Changed", {});
                assert.equal(closeErrors.length, 2, `Expected to close again after waiting 1 day`);
                assert.equal(closeErrors[1]?.errorType ?? "", sweepReadyUsageErrorType, "Expected sweepReadyUsageErrorType the second time");
            });
            it("Incorrect JSON type for closure map value in localStorage - recovers and respects the Skip Closure Period", () => {
                const handler = createHandler();
                mockLocalStorage[closuresMapLocalStorageKey] = JSON.stringify("Not an object");

                clock.tick(10);
                handler.usageDetectedInInteractiveClient("Changed", {});
                assert.deepEqual(JSON.parse(mockLocalStorage[closuresMapLocalStorageKey] as string), { key1: { lastCloseTime: 10 } });
                assert.equal(closeErrors.length, 1, `Expected to close the first time`);
                assert.equal(closeErrors[0]?.errorType ?? "", sweepReadyUsageErrorType, "Expected sweepReadyUsageErrorType the first time");

                clock.tick(10);
                handler.usageDetectedInInteractiveClient("Changed", {});
                assert.equal(closeErrors.length, 1, `Should NOT have closed back-to-back due to Skip Closure Period. errors:\n${closeErrors}`);

                clock.tick(oneDayMs);
                handler.usageDetectedInInteractiveClient("Changed", {});
                assert.equal(closeErrors.length, 2, `Expected to close again after waiting 1 day`);
                assert.equal(closeErrors[1]?.errorType ?? "", sweepReadyUsageErrorType, "Expected sweepReadyUsageErrorType the second time");
            });
            it("Incorrect JSON schema for closure map value in localStorage - recovers and respects the Skip Closure Period", () => {
                const handler = createHandler();
                mockLocalStorage[closuresMapLocalStorageKey] = JSON.stringify({ key1: { wrongSchema: "no lastCloseTime member" } });

                clock.tick(10);
                handler.usageDetectedInInteractiveClient("Changed", {});
                assert.deepEqual(JSON.parse(mockLocalStorage[closuresMapLocalStorageKey] as string), { key1: { lastCloseTime: 10 } });
                assert.equal(closeErrors.length, 1, `Expected to close the first time`);
                assert.equal(closeErrors[0]?.errorType ?? "", sweepReadyUsageErrorType, "Expected sweepReadyUsageErrorType the first time");

                clock.tick(10);
                handler.usageDetectedInInteractiveClient("Changed", {});
                assert.equal(closeErrors.length, 1, `Should NOT have closed back-to-back due to Skip Closure Period. errors:\n${closeErrors}`);

                clock.tick(oneDayMs);
                handler.usageDetectedInInteractiveClient("Changed", {});
                assert.equal(closeErrors.length, 2, `Expected to close again after waiting 1 day`);
                assert.equal(closeErrors[1]?.errorType ?? "", sweepReadyUsageErrorType, "Expected sweepReadyUsageErrorType the second time");
            });
            describe("interactiveClientCrashOnLoad", () => {
                beforeEach(() => {
                    mockLocalStorage[sweepReadyUsageDetectionKey] = "blah interactiveClientCrashOnLoad blah";
                });
                it("setting contains 'interactiveClientCrashOnLoad' - no-op for Changed/Revived usage", () => {
                    createHandler().usageDetectedInInteractiveClient("Changed", {});
                    createHandler().usageDetectedInInteractiveClient("Revived", {});
                    assert.equal(closeErrors.length, 0, "Shouldn't close if setting doesn't include 'interactiveClientClose'");
                });
                it("setting contains 'interactiveClientCrashOnLoad' - throws with Loaded usage just once (due to skip)", () => {
                    assert.throws(
                        () => createHandler().usageDetectedInInteractiveClient("Loaded", {}),
                        (e) => e.errorType === "garbageObjectUsedError",
                        "Expected the proper error to be thrown");
                    mockLogger.assertMatch([{ eventName: "SweepReadyObject_FailToLoad" }], "expected error log");
                    assert.equal(closeErrors.length, 0, "Shouldn't close the whole container when failing load");

                    createHandler().usageDetectedInInteractiveClient("Loaded", {});
                    mockLogger.assertMatch([{ eventName: "SweepReadyObject_UsageAllowed" }], "expected error log");
                });
            });
        });
    });
});
