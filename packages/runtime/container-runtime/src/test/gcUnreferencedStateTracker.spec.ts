/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { strict as assert } from "assert";
import { SinonFakeTimers, useFakeTimers } from "sinon";
import {
    UnreferencedState,
    UnreferencedStateTracker,
} from "../garbageCollection";

describe("Garbage Collection Tests", () => {
    let clock: SinonFakeTimers;

    before(() => {
        clock = useFakeTimers();
    });

    afterEach(() => {
        clock.reset();
    });

    after(() => {
        clock.restore();
    });

    describe("UnreferencedStateTracker", () => {
        /**
         * During the lifetime of an unreferenced object, its state is tracked and updated in two ways.
         * Timers are set to trigger transitioning to the next state, and updateTracking is also called
         * whenever GC runs.
         * These tests specify how to advance the clock (to hit the timers) and also when to call updateTracking,
         * checking that the expected state transitions occur as specified
         */
        function runTestCase(testCase: { start: [number, UnreferencedState]; steps: [number, number | undefined, UnreferencedState][]; }) {
            return () => {
                const [startTimestamp, startState] = testCase.start;
                const tracker = new UnreferencedStateTracker(
                    0 /* unreferencedTimestampMs */,
                    10 /* inactiveTimeoutMs */,
                    20 /* sweepTimeoutMs */,
                    startTimestamp /* currentReferenceTimestampMs */,
                );
                assert.equal(tracker.state, startState, `Wrong starting state`);
                let lastTime = startTimestamp;
                testCase.steps.forEach(([localTime, currentReferenceTimestampMs, expectedState], index) => {
                    assert(localTime > lastTime, "INVALID TEST CASE: steps must move forward in time, following start");
                    const delta = localTime - lastTime;
                    clock.tick(delta);
                    lastTime = localTime;

                    if (currentReferenceTimestampMs !== undefined) {
                        tracker.updateTracking(currentReferenceTimestampMs);
                    }

                    assert.equal(tracker.state, expectedState, `Wrong state at step ${index}`);
                });
                tracker.stopTracking();
            };
        }

        // In all cases:  unreferencedTimestampMs = 0, inactiveTimeoutMs = 10, sweepTimeoutMs = 20
        const testCases: { name: string; start: [number, UnreferencedState]; steps: [number, number | undefined, UnreferencedState][]; }[] = [
            {
                name: "No calls to updateTracking",
                start: [0, "Active"],
                steps: [
                    [3, undefined, "Active"],
                    [5, undefined, "Active"],
                    [12, undefined, "Inactive"],
                    [15, undefined, "Inactive"],
                    [25, undefined, "SweepReady"],
                ],
            },
            {
                name: "Call update, but triggered via timers",
                start: [0, "Active"],
                steps: [
                    [3, 2, "Active"],
                    [5, 5, "Active"],
                    [12, 9, "Inactive"], // Timer will have fired even though server time hasn't passed threshold
                    [15, 15, "Inactive"],
                    [25, undefined, "SweepReady"],
                ],
            },
            {
                name: "currentReferenceTimestampMs jumps ahead",
                start: [0, "Active"],
                steps: [
                    [5, undefined, "Active"],
                    [10, undefined, "Inactive"],
                    [11, 20, "SweepReady"],  // Shouldn't be physically possible, but supported in API
                ],
            },
            {
                name: "Start Inactive",
                start: [12, "Inactive"],
                steps: [
                    [15, undefined, "Inactive"],
                    [20, undefined, "SweepReady"],
                ],
            },
            {
                name: "Start SweepReady",
                start: [22, "SweepReady"],
                steps: [],
            },
        ];

        testCases.forEach((testCase) => {
            it(testCase.name, () => {
                runTestCase(testCase);
            });
        });

        it("No currentReferenceTimestampMs in constructor - Only leaves Active after calling updateTracking", () => {
            const tracker = new UnreferencedStateTracker(
                0 /* unreferencedTimestampMs */,
                3 /* inactiveTimeoutMs */,
                7 /* sweepTimeoutMs */,
            );
            assert.equal(tracker.state, UnreferencedState.Active, "Should start as Active");
            clock.tick(100);
            assert.equal(tracker.state, UnreferencedState.Active, "Should stay active without currentReferenceTimestampMs");
            tracker.updateTracking(10);
            assert.equal(tracker.state, UnreferencedState.SweepReady, "Future currentReferenceTimestampMs via updateTracking should trigger state change");
        });

        it("Non-zero unreferencedTimestampMs properly offsets", () => {
            const tracker = new UnreferencedStateTracker(
                10 /* unreferencedTimestampMs */,
                3 /* inactiveTimeoutMs */,
                7 /* sweepTimeoutMs */,
                11 /* currentReferenceTimestampMs */,
            );
            assert.equal(tracker.state, UnreferencedState.Active, "Should start as Active");
            clock.tick(5);
            assert.equal(tracker.state, UnreferencedState.Inactive, "Should be Inactive 5ms later");
            tracker.updateTracking(17);
            assert.equal(tracker.state, UnreferencedState.SweepReady, "Should be SweepReady after currentReferenceTimestampMs=17");
        });
    });
});
