/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TestEngine1, TestEngine2, TestLumberjack } from "./lumberjackCommonTestUtils";
import { LumberEventName } from "../lumberEventNames";
import assert from "assert";

describe("Lumberjack", () => {
    afterEach(() => {
        TestLumberjack.reset();
    });

    it("Sets up Lumberjack's global instance and creates a Lumber metric.", async () => {
        const engine = new TestEngine1();
        TestLumberjack.instance.setupEngines([engine]);
        try {
            TestLumberjack.instance.newLumberMetric(LumberEventName.UnitTestEvent);
        } catch (err) {
            assert.fail("Lumberjack should not have failed to create Lumber as it has a non-empty engine list.");
        }
    });

    it("Sets up a custom Lumberjack instance and creates a Lumber metric.", async () => {
        const engine = new TestEngine1();
        const customInstance = TestLumberjack.create([engine]);
        try {
            customInstance.newLumberMetric(LumberEventName.UnitTestEvent);
        } catch (err) {
            assert.fail("Custom Lumberjack instance should not have failed to create Lumber as it has a non-empty engine list.");
        }
    });

    it("Setting up custom instance of Lumberjack should not interfere with the global instance.", async () => {
        const engine1 = new TestEngine1();
        const engine2 = new TestEngine2();
        TestLumberjack.instance.setupEngines([engine1]);
        try {
            TestLumberjack.create([engine2]);
        } catch (err) {
            assert.fail("Creating a custom Lumberjack instance should not have failed since global and custom instances each have their own engine list. ");
        }
    });

    it("Lumberjack should fail when trying to set up engines more than once.", async () => {
        const engine1 = new TestEngine1();
        const engine2 = new TestEngine2();
        TestLumberjack.instance.setupEngines([engine1]);
        try {
            TestLumberjack.instance.setupEngines([engine2]);
        } catch (err) {
            return;
        }

        assert.fail("Lumberjack should not allow setting up engines more than once.");
    });

    it("Lumberjack should fail when trying to create a metric while having an empty engine list.", async () => {
        try {
            TestLumberjack.instance.newLumberMetric(LumberEventName.UnitTestEvent);
        } catch (err) {
            return;
        }

        assert.fail("Lumberjack should warn and throw error when a Lumber is created before the list of engines is populated.");
    });
});
