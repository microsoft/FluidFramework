/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import { describe, it, after, afterEach, before, beforeEach } from "mocha";
import { useFakeTimers, type SinonFakeTimers } from "sinon";

import {
	StateFactory,
	// type PresenceStates,
	type StateSchemaValidator,
	// SessionClientStatus,
	// type ClientConnectionId,
	// type ISessionClient,
} from "../index.js";
import type { createPresenceManager } from "../presenceManager.js";

import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";
import {
	assertFinalExpectations,
	createNullValidator,
	createSpiedValidator,
	// generateBasicClientJoin,
	prepareConnectedPresence,
	type ValidatorSpy,
} from "./testUtils.js";

describe("Presence", () => {
	let runtime: MockEphemeralRuntime;
	let logger: EventAndErrorTrackingLogger;
	const initialTime = 1000;
	let clock: SinonFakeTimers;

	before(async () => {
		clock = useFakeTimers();
	});

	beforeEach(() => {
		logger = new EventAndErrorTrackingLogger();
		runtime = new MockEphemeralRuntime(logger);
		clock.setSystemTime(initialTime);
	});

	afterEach(function (done: Mocha.Done) {
		clock.reset();

		// If the test passed so far, check final expectations.
		if (this.currentTest?.state === "passed") {
			assertFinalExpectations(runtime, logger);
		}
		done();
	});

	after(() => {
		clock.restore();
	});

	describe("schema validation", () => {
		let presence: ReturnType<typeof createPresenceManager>;
		const afterCleanUp: (() => void)[] = [];

		beforeEach(() => {
			presence = prepareConnectedPresence(runtime, "sessionId-2", "client2", clock, logger);
		});

		afterEach(() => {
			for (const cleanUp of afterCleanUp) {
				cleanUp();
			}
			afterCleanUp.length = 0;
		});

		describe("LatestValueManager", () => {
			// let stateWorkspace: PresenceStates<{ num: 0 }>;
			let validatorFunction: StateSchemaValidator<{ num: number }>;
			let validatorSpy: ValidatorSpy;

			beforeEach(() => {
				// Ignore submitted signals
				runtime.submitSignal = () => {};

				[validatorFunction, validatorSpy] = createSpiedValidator<{ num: number }>(
					createNullValidator(),
				);

				assert.equal(validatorSpy.callCount, 0);
			});

			it("validator is called when data is read", () => {
				// Setup
				// Configure a state workspace
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latest(
						{ num: 0 },
						{ validator: validatorFunction, controls: { allowableUpdateLatencyMs: 0 } },
					),
				});

				const { count } = stateWorkspace.props;

				// Act & Verify
				count.local = { num: 84 };

				const value = count.local;

				// Reading the data should cause the validator to get called once.
				assert.equal(validatorSpy.callCount, 1);
				assert.equal(value.num, 84);
			});

			// TODO: test is failing
			it.skip("validator is not called multiple times for the same data", () => {
				// Setup
				// Configure a state workspace
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latest(
						{ num: 0 },
						{ validator: validatorFunction, controls: { allowableUpdateLatencyMs: 0 } },
					),
				});

				const { count } = stateWorkspace.props;
				count.local = { num: 84 };

				// Act & Verify
				// Reading the data should cause the validator to get called once.
				let value = count.getRemote(presence.attendees.getMyself());

				// Subsequent reads should not call the validator when there is no new data.
				value = count.getRemote(presence.attendees.getMyself());
				value = count.getRemote(presence.attendees.getMyself());
				assert.equal(validatorSpy.callCount, 1);
				assert.equal(value.value?.num, 84);
			});

			// TODO: test is failing
			it("throws on invalid data", () => {
				// Setup
				// Configure a state workspace
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latest(
						{ num: 0 },
						{ validator: validatorFunction, controls: { allowableUpdateLatencyMs: 0 } },
					),
				});

				const { count } = stateWorkspace.props;
				count.local = 84 as unknown as { num: number };

				// Act & Verify
				// Reading the data should cause the validator to get called once.
				let value = count.getRemote(presence.attendees.getMyself());

				// Subsequent reads should not call the validator when there is no new data.
				value = count.getRemote(presence.attendees.getMyself());
				value = count.getRemote(presence.attendees.getMyself());
				assert.equal(value.value?.num, 84);
				assert.equal(validatorSpy.callCount, 1);
			});
		});

		// TODO: tests are failing
		describe.skip("LatestMapValueManager", () => {
			// let stateWorkspace: PresenceStates<{ num: 0 }>;
			let validatorFunction: StateSchemaValidator<{ num: number }>;
			let validatorSpy: ValidatorSpy;

			beforeEach(() => {
				// Ignore submitted signals
				runtime.submitSignal = () => {};

				[validatorFunction, validatorSpy] = createSpiedValidator<{ num: number }>(
					createNullValidator(),
				);

				assert.equal(validatorSpy.callCount, 0);
			});

			it("validator is called when data is read", () => {
				// Setup
				// Configure a state workspace
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latestMap(
						{ "key1": { num: 0 } },
						{ validator: validatorFunction, controls: { allowableUpdateLatencyMs: 0 } },
					),
				});

				const { count } = stateWorkspace.props;

				// Act & Verify
				count.local.set("key1", { num: 84 });

				const value = count.getRemote(presence.attendees.getMyself());

				// Reading the data should cause the validator to get called once.
				assert.equal(validatorSpy.callCount, 1);
				assert.equal(value.get("key1")?.value?.num, 84);
			});

			it("validator is not called multiple times for the same data", () => {
				// Setup
				// Configure a state workspace
				const stateWorkspace = presence.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latestMap(
						{ "key1": { num: 0 } },
						{ validator: validatorFunction, controls: { allowableUpdateLatencyMs: 0 } },
					),
				});

				const { count } = stateWorkspace.props;
				count.local.set("key1", { num: 84 });

				// Act & Verify
				// Reading the data should cause the validator to get called once.
				let value = count.getRemote(presence.attendees.getMyself());

				// Subsequent reads should not call the validator when there is no new data.
				value = count.getRemote(presence.attendees.getMyself());
				value = count.getRemote(presence.attendees.getMyself());
				assert.equal(validatorSpy.callCount, 1);
				assert.equal(value.get("key1")?.value?.num, 84);
			});
		});
	});
});
