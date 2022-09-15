/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { strict as assert } from "assert";
import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { loggerToMonitoringContext, MockLogger, sessionStorageConfigProvider, ConfigTypes } from "@fluidframework/telemetry-utils";
import {
    SweepReadyUsageDetectionHandler,
} from "../gcSweepReadyUsageDetection";

describe("Garbage Collection Tests", () => {
    describe.only("SweepReady Usage Detection", () => {
        const sweepReadyUsageDetectionKey = "Fluid.GarbageCollection.Dogfood.SweepReadyUsageDetection";
        const blackoutPeriodDays = "Fluid.GarbageCollection.Dogfood.SweepReadyUsageDetection.ThrottlingDurationDays";
//*        const closuresStorageKey = "Fluid.GarbageCollection.Dogfood.SweepReadyUsageDetection.Closures";
        const sweepReadyUsageErrorType = "objectUsedAfterMarkedForDeletionError";

        // used to inject settings into MonitoringContext, and also to mock localStorage for the handler
        let mockLocalStorage: Record<string, ConfigTypes> = {};
        let closeErrors: (ICriticalContainerError)[] = [];
        const createHandler = () => new SweepReadyUsageDetectionHandler(
            "key1",
            loggerToMonitoringContext(new MockLogger()),
            { getItem(key) { return null; }, setItem(key, value) {} }, //* Implement using mockLocalStorage
            (e) => { assert(e, "PRECONDITION: Only expected closure due to error"); closeErrors.push(e); },
        );

        const oldRawConfig = sessionStorageConfigProvider.value.getRawConfig;
        before(() => {
            sessionStorageConfigProvider.value.getRawConfig = (name) => mockLocalStorage[name];
        });
        after(() => {
            sessionStorageConfigProvider.value.getRawConfig = oldRawConfig;
        });
        beforeEach(() => {
            closeErrors = [];
        });
        afterEach(() => {
            mockLocalStorage = {};
        });

        describe("usageDetectedInMainContainer", () => {
            beforeEach(() => {
                // For these tests, enable by default
                mockLocalStorage[sweepReadyUsageDetectionKey] = "blah mainContainer blah";
            });
            it("setting does not contain 'mainContainer' - do not close the container", () => {
                mockLocalStorage[sweepReadyUsageDetectionKey] = "summarizer or whatever";
                createHandler().usageDetectedInMainContainer({});
                assert.equal(closeErrors.length, 0, "Shouldn't close if setting doesn't include 'mainContainer'");
            });
            it("BlackoutPeriod undefined - close the container back-to-back", () => {
                mockLocalStorage[blackoutPeriodDays] = undefined;
                const handler = createHandler();
                handler.usageDetectedInMainContainer({});
                handler.usageDetectedInMainContainer({});
                assert.equal(closeErrors.length, 2, `Should have closed back-to-back with no blackout period defined. errors:\n${closeErrors}`);
                assert(closeErrors.every((e) => e.errorType === sweepReadyUsageErrorType), `Expected all SweepReadyUsageErrors. errors:\n${closeErrors}`);
            });
        });
    });
});
