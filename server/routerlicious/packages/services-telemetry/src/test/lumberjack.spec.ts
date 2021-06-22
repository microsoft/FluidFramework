/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { sampleTelemetryMetadata, TestEngine, TestLumberjack } from "./lumberjackCommonTestUtils";
import { LumberEventName } from "../lumberEventNames";
import assert from "assert";

describe("Lumberjack", () => {
    afterEach(() => {
        TestLumberjack.reset();
    });

    it("Sets up Lumberjack and creates a Lumber metric.", async () => {
        const engine = new TestEngine();
        TestLumberjack.instance.setupEngines([engine]);
        try {
            TestLumberjack.instance.newLumberMetric(
                LumberEventName.UnitTestEvent,
                sampleTelemetryMetadata);
        } catch (err) {
            assert.fail("Lumberjack should have not failed to create Lumber as it has a non-empty engine list.");
        }
    });

    it("Lumberjack should fail when trying to set up engines more than once.", async () => {
        const engine = new TestEngine();
        TestLumberjack.instance.setupEngines([engine]);
        try {
            TestLumberjack.instance.setupEngines([engine]);
        } catch (err) {
            return;
        }

        assert.fail("Lumberjack should not allow setting up engines more than once.");
    });

    it("Lumberjack should fail when trying to create a metric while having an empty engine list.", async () => {
        try {
            TestLumberjack.instance.newLumberMetric(
                LumberEventName.UnitTestEvent,
                sampleTelemetryMetadata);
        } catch (err) {
            return;
        }

        assert.fail("Lumberjack should warn and throw error when a Lumber is created before the list of engines is populated.");
    });
});
