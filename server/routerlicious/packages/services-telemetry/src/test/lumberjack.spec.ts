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

    it("Sets up Lumberjack's global instance and creates a Lumber metric.", () => {
        const engine = new TestEngine1();
        TestLumberjack.setup([engine]);
        try {
            TestLumberjack.newLumberMetric(LumberEventName.UnitTestEvent);
        } catch (err) {
            assert.fail("Lumberjack should not have failed to create Lumber as it has been set up already.");
        }
    });

    it("Sets up a custom Lumberjack instance and creates a Lumber metric.", () => {
        const engine = new TestEngine1();
        const customInstance = TestLumberjack.create([engine]);
        try {
            customInstance.newLumberMetric(LumberEventName.UnitTestEvent);
        } catch (err) {
            assert.fail("Custom Lumberjack instance should not have failed to create Lumber as it has been set up already.");
        }
    });

    it("Setting up custom instance of Lumberjack should not interfere with the global instance.", () => {
        const engine1 = new TestEngine1();
        const engine2 = new TestEngine2();
        TestLumberjack.setup([engine1]);
        try {
            TestLumberjack.create([engine2]);
        } catch (err) {
            assert.fail("Creating a custom Lumberjack instance should not have failed since global and custom instances should be independent.");
        }
    });

    it("Lumberjack should fail when trying to set it up more than once.", () => {
        const engine1 = new TestEngine1();
        const engine2 = new TestEngine2();
        TestLumberjack.setup([engine1]);
        try {
            TestLumberjack.setup([engine2]);
        } catch (err) {
            return;
        }

        assert.fail("Lumberjack should not allow setup more than once to avoid overriding engine list and schema validator.");
    });

    it("Lumberjack should fail when trying to use it with an empty engine list.", () => {
        try {
            TestLumberjack.setup([]);
        } catch (err) {
            return;
        }

        assert.fail("Lumberjack should not allow normal operation if the engine list used during setup was empty.");
    });

    it("Lumberjack should fail when trying to create a metric before being properly set up.", () => {
        try {
            TestLumberjack.newLumberMetric(LumberEventName.UnitTestEvent);
        } catch (err) {
            return;
        }

        assert.fail("Lumberjack should warn and throw error when a Lumber is created before it is fully set up.");
    });
});
