/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import type { SinonFakeTimers } from "sinon";
import { useFakeTimers } from "sinon";

import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";
import { assertFinalExpectations, prepareConnectedPresence } from "./testUtils.js";

import { Latest, type LatestValueManager } from "@fluidframework/presence/alpha";

describe("State Eventing", () => {
	let runtime: MockEphemeralRuntime;
	let logger: EventAndErrorTrackingLogger;
	let clock: SinonFakeTimers;
	let presence: ReturnType<typeof prepareConnectedPresence>;
	before(() => {
		clock = useFakeTimers();
	});
	beforeEach(() => {
		logger = new EventAndErrorTrackingLogger();
		runtime = new MockEphemeralRuntime(logger);
		presence = prepareConnectedPresence(runtime, "sessionId-2", "client2", clock, logger);
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

	describe("LatestValueManager", () => {
		let latest: LatestValueManager<{ x: number; y: number; z: number }>;
		beforeEach(() => {
			const states = presence.getStates("name:testWorkspace", {
				latest: Latest({ x: 0, y: 0, z: 0 }),
			});
			latest = states.props.latest;
		});

		it("receives consistent event ordering", () => {
			latest.events.on("updated", () => {
				assert(presence.getAttendee("client1") !== undefined);
			});
			presence.events.on("attendeeJoined", (attendee) => {
				assert.deepEqual(latest.clientValue(attendee).value, { x: 1, y: 1, z: 1 });
			});
			presence.processSignal(
				"",
				{
					type: "Pres:DatastoreUpdate",
					content: {
						sendTimestamp: clock.now - 10,
						avgLatency: 20,
						data: {
							"system:presence": {
								"clientToSessionId": {
									"client1": {
										"rev": 0,
										"timestamp": 0,
										"value": "sessionId-1",
									},
								},
							},
							"s:name:testWorkspace": {
								"latest": {
									"sessionId-1": {
										"rev": 1,
										"timestamp": 0,
										"value": { x: 1, y: 1, z: 1 },
									},
								},
							},
						},
					},
					clientId: "client1",
				},
				false,
			);
		});
	});
});
