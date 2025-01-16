/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { SinonFakeTimers, SinonSpy, spy, useFakeTimers } from "sinon";

import { UnreferencedState, UnreferencedStateTracker } from "../../gc/index.js";

/**
 * Schema for steps taken to test unreferenced state progression / tracking
 */
type Steps = [
	{
		/**
		 * Start time (used as both local time and currentReferenceTimestampMs)
		 */
		time: number;
		/**
		 * Expected initial state
		 */
		state: UnreferencedState;
		/**
		 * Configured sweepGracePeriodMs - defaults to 10ms for these tests
		 */
		sweepGracePeriodMs?: number;
	},
	...{
		/**
		 * Local time of the next step
		 */
		time: number;
		/**
		 * If defined, call updateTracking with this as currentReferenceTimestampMs
		 */
		updateWith?: number;
		/**
		 * Expected new state (after calling updateTracking if applicable)
		 */
		state: UnreferencedState;
	}[],
];

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
		let tracker: UnreferencedStateTracker;

		afterEach(() => {
			tracker.stopTracking();
		});

		/**
		 * During the lifetime of an unreferenced object, its state is tracked and updated in two ways.
		 * Timers are set to trigger transitioning to the next state, and updateTracking is also called
		 * whenever GC runs.
		 * These tests specify how to advance the clock (to hit the timers) and also when to call updateTracking,
		 * checking that the expected state transitions occur as specified
		 */
		function runTestCase(allSteps: Steps) {
			const [start, ...steps] = allSteps;
			clock.tick(start.time);

			tracker = new UnreferencedStateTracker(
				0 /* unreferencedTimestampMs */,
				10 /* inactiveTimeoutMs */,
				start.time /* currentReferenceTimestampMs */,
				20 /* tombstoneTimeoutMs */,
				start.sweepGracePeriodMs ?? 10 /* sweepGracePeriodMs */,
			);
			assert.equal(tracker.state, start.state, `Wrong starting state`);
			steps.forEach(({ time: advanceClockTo, updateWith, state: expectedState }, index) => {
				assert(
					advanceClockTo > clock.now,
					"INVALID TEST CASE: steps must move forward in time, following start",
				);
				clock.tick(advanceClockTo - clock.now);

				if (updateWith !== undefined) {
					tracker.updateTracking(updateWith);
				}

				assert.equal(tracker.state, expectedState, `Wrong state at step ${index + 1}`); // 0-indexed including start
			});
		}

		/**
		 * Test cases to run through above function runTestCase
		 *
		 * In all cases:
		 * - unreferencedTimestampMs = 0
		 * - inactiveTimeoutMs = 10
		 * - tombstoneTimeoutMs = 20
		 * - sweepGracePeriodMs defaults to 10 (so sweep at 30)
		 */
		const testCases: {
			name: string;
			steps: Steps;
		}[] = [
			{
				name: "No calls to updateTracking",
				steps: [
					{ time: 0, state: "Active" },
					{ time: 3, state: "Active" },
					{ time: 5, state: "Active" },
					{ time: 12, state: "Inactive" },
					{ time: 15, state: "Inactive" },
					{ time: 25, state: "TombstoneReady" },
					{ time: 35, state: "SweepReady" },
				],
			},
			{
				name: "No calls to updateTracking - sweepGracePeriodMs 0 (no Tombstone phase)",
				steps: [
					{ time: 0, state: "Active", sweepGracePeriodMs: 0 },
					{ time: 3, state: "Active" },
					{ time: 5, state: "Active" },
					{ time: 12, state: "Inactive" },
					{ time: 19, state: "Inactive" },
					{ time: 20, state: "SweepReady" },
					{ time: 21, state: "SweepReady" },
				],
			},
			{
				name: "Skip to SweepReady",
				steps: [
					{ time: 0, state: "Active" },
					{ time: 5, state: "Active" },
					{ time: 35, state: "SweepReady" },
				],
			},
			{
				name: "Skip to SweepReady - sweepGracePeriodMs 0 (no Tombstone phase)",
				steps: [
					{ time: 0, state: "Active", sweepGracePeriodMs: 0 },
					{ time: 5, state: "Active" },
					{ time: 20, state: "SweepReady" },
				],
			},
			{
				name: "Skip to SweepReady (via updateTracking) - sweepGracePeriodMs 0 (no Tombstone phase)",
				steps: [
					{ time: 0, state: "Active", sweepGracePeriodMs: 0 },
					{ time: 5, state: "Active" },
					{ time: 20, updateWith: 20, state: "SweepReady" },
				],
			},
			{
				name: "Call update, but triggered via timers",
				steps: [
					{ time: 0, state: "Active" },
					{ time: 3, updateWith: 2, state: "Active" },
					{ time: 5, updateWith: 5, state: "Active" },
					{ time: 12, updateWith: 9, state: "Inactive" }, // Timer will have fired even though server time hasn't passed threshold
					{ time: 17, updateWith: 15, state: "Inactive" }, // No-op, timer already fired
				],
			},
			{
				name: "currentReferenceTimestampMs jumps ahead",
				steps: [
					{ time: 0, state: "Active" },
					{ time: 5, state: "Active" },
					{ time: 10, state: "Inactive" },
					{ time: 11, updateWith: 20, state: "TombstoneReady" }, // Shouldn't be physically possible, but supported in API
				],
			},
			{
				name: "Start Inactive",
				steps: [
					{ time: 12, state: "Inactive" },
					{ time: 15, state: "Inactive" },
					{ time: 20, state: "TombstoneReady" },
					{ time: 35, state: "SweepReady" },
				],
			},
			{
				name: "Start TombstoneReady",
				steps: [
					{ time: 22, state: "TombstoneReady" },
					{ time: 25, state: "TombstoneReady" },
					{ time: 35, state: "SweepReady" },
				],
			},
			{
				name: "Start SweepReady",
				steps: [{ time: 32, state: "SweepReady" }],
			},
		];

		testCases.forEach((testCase) => {
			it(testCase.name, () => {
				runTestCase(testCase.steps);
			});
		});

		it("Non-zero unreferencedTimestampMs properly offsets", () => {
			tracker = new UnreferencedStateTracker(
				10 /* unreferencedTimestampMs */,
				3 /* inactiveTimeoutMs */,
				11 /* currentReferenceTimestampMs */,
				7 /* tombstoneTimeoutMs */,
				15 /* sweepGracePeriodMs */,
			);
			assert.equal(tracker.state, UnreferencedState.Active, "Should start as Active");
			clock.tick(2);
			assert.equal(
				tracker.state,
				UnreferencedState.Inactive,
				"Should be Inactive 2ms later (at 13)",
			);
			tracker.updateTracking(17);
			assert.equal(
				tracker.state,
				UnreferencedState.TombstoneReady,
				"Should be TombstoneReady after currentReferenceTimestampMs=17",
			);
			clock.tick(15);
			assert.equal(
				tracker.state,
				UnreferencedState.SweepReady,
				"Should be SweepReady 15ms later",
			);
		});
		it("Timers can't be crossed", () => {
			tracker = new UnreferencedStateTracker(
				0 /* unreferencedTimestampMs */,
				10 /* inactiveTimeoutMs */,
				0 /* currentReferenceTimestampMs */,
				12 /* tombstoneTimeoutMs */,
				0 /* sweepGracePeriodMs */,
			);
			assert.equal(tracker.state, UnreferencedState.Active, "Should start as Active");
			tracker.updateTracking(10);
			// Would be 10ms left on Inactive timer, but it was just cleared. 2ms left on Sweep timer
			assert.equal(
				tracker.state,
				UnreferencedState.Inactive,
				"Should be Inactive after currentReferenceTimestampMs=10",
			);
			clock.tick(2);
			assert.equal(
				tracker.state,
				UnreferencedState.SweepReady,
				"Should be SweepReady 2ms later",
			);
		});
		it("Timers can tighten up over time", () => {
			clock.tick(10);
			tracker = new UnreferencedStateTracker(
				0 /* unreferencedTimestampMs */,
				20 /* inactiveTimeoutMs */,
				5 /* currentReferenceTimestampMs */,
				undefined /* tombstoneTimeoutMs */,
				0 /* sweepGracePeriodMs */,
			);
			assert.equal(tracker.state, UnreferencedState.Active, "Should start as Active");
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const timerClearSpy: SinonSpy = spy((tracker as any).inactiveTimer, "clear");
			// At T10 we had 15 to go based on server timestamps, so Timer is set to 25
			clock.tick(6); // at T16 (9 to go)
			tracker.updateTracking(15); // Simulate processing a more-recent Summary (reference time 15 at T16). Pulls in timer to 21 (5 to go)
			assert(
				timerClearSpy.callCount > 0,
				"Expected underlying Timer to clear and reset to support shorter timeout",
			);
			clock.tick(5);
			assert.equal(tracker.state, UnreferencedState.Inactive, "Should be Inactive at T21");
		});
		it("Timers can loosen up over time", () => {
			tracker = new UnreferencedStateTracker(
				0 /* unreferencedTimestampMs */,
				10 /* inactiveTimeoutMs */,
				0 /* currentReferenceTimestampMs */,
				undefined /* tombstoneTimeoutMs */,
				0 /* sweepGracePeriodMs */,
			);
			assert.equal(tracker.state, UnreferencedState.Active, "Should start as Active");
			clock.tick(5); // at T5, 5 to go
			tracker.updateTracking(1); // Simulate processing an older Summary (reference time 1 at T5). Pushes out timer to 14 (9 to go)
			clock.tick(5);
			assert.equal(
				tracker.state,
				UnreferencedState.Active,
				"Should still be Active since timer was pushed out",
			);
			clock.tick(4);
			assert.equal(
				tracker.state,
				UnreferencedState.Inactive,
				"Should be Inactive finally at T14",
			);
		});
	});
});
