/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import { describe, it, after, afterEach, before, beforeEach } from "mocha";
import { useFakeTimers, type SinonFakeTimers } from "sinon";

import { toOpaqueJson } from "../../internalUtils.js";
import type { createPresenceManager } from "../../presenceManager.js";
import type { OutboundDatastoreUpdateMessage } from "../../protocol.js";
import { MockEphemeralRuntime } from "../mockEphemeralRuntime.js";
import {
	assertFinalExpectations,
	attendeeId1,
	attendeeId2,
	connectionId1,
	connectionId2,
	createSpecificAttendeeId,
	createSpiedValidator,
	generateBasicClientJoin,
	prepareConnectedPresence,
} from "../testUtils.js";

import { StateFactory } from "@fluidframework/presence/beta";

/**
 * Workspace updates
 */
interface Point3D {
	x: number;
	y: number;
	z: number;
}

const attendeeUpdate = {
	"clientToSessionId": {
		"client1": {
			"rev": 0,
			"timestamp": 0,
			"value": attendeeId1,
		},
	},
} as const;
const latestUpdate = {
	"latest": {
		[attendeeId1]: {
			"rev": 1,
			"timestamp": 0,
			"value": toOpaqueJson({ x: 1, y: 1, z: 1 }),
		},
	},
} as const;
const latestMapUpdate = {
	"latestMap": {
		[attendeeId1]: {
			"rev": 1,
			"items": {
				"key1": {
					"rev": 1,
					"timestamp": 0,
					"value": toOpaqueJson({ a: 1, b: 1 }),
				},
				"key2": {
					"rev": 1,
					"timestamp": 0,
					// out of schema value
					"value": toOpaqueJson({ b: 1, d: 1 }),
				},
			},
		},
	},
} as const;

describe("Presence", () => {
	describe("Runtime schema validation", () => {
		const afterCleanUp: (() => void)[] = [];
		const initialTime = 1000;

		type UpdateContent = typeof latestUpdate & typeof latestMapUpdate;

		function processUpdates(valueManagerUpdates: Record<string, UpdateContent>): void {
			const updates = { "system:presence": attendeeUpdate, ...valueManagerUpdates };

			presence.processSignal(
				[],
				{
					type: "Pres:DatastoreUpdate",
					content: {
						sendTimestamp: clock.now - 10,
						avgLatency: 20,
						data: updates,
					},
					clientId: "client1",
				},
				false,
			);
		}

		let clock: SinonFakeTimers;
		let logger: EventAndErrorTrackingLogger;
		let presence: ReturnType<typeof createPresenceManager>;
		let runtime: MockEphemeralRuntime;

		before(async () => {
			clock = useFakeTimers();
		});

		beforeEach(() => {
			logger = new EventAndErrorTrackingLogger();
			runtime = new MockEphemeralRuntime(logger);
			clock.setSystemTime(initialTime);

			// Create Presence joining session as attendeeId-2.
			presence = prepareConnectedPresence(runtime, attendeeId2, connectionId2, clock, logger);

			// Pass a little time (to mimic reality)
			clock.tick(10);

			// Process remote client update signal (attendeeId-1 is then part of local client's known session).
			const workspace = {
				"s:name:testWorkspace": { ...latestUpdate, ...latestMapUpdate },
			};
			processUpdates(workspace);

			// Pass a little time (to mimic reality)
			clock.tick(10);
		});

		afterEach(function (done: Mocha.Done) {
			clock.reset();

			// If the test passed so far, check final expectations.
			if (this.currentTest?.state === "passed") {
				assertFinalExpectations(runtime, logger);
			}

			for (const cleanUp of afterCleanUp) {
				cleanUp();
			}
			afterCleanUp.length = 0;
			done();
		});

		after(() => {
			clock.restore();
		});

		describe("response to Join signal", () => {
			it("does not contain validation metadata for remote clients", () => {
				// Setup

				// Check Join response without active validators
				const attendeeId4 = createSpecificAttendeeId("attendeeId-4");
				const connectionId4 = "client4" as const;
				const newAttendeeSignal = generateBasicClientJoin(clock.now - 50, {
					averageLatency: 50,
					attendeeId: attendeeId4,
					clientConnectionId: connectionId4,
					updateProviders: ["client2"],
				});
				const expectedSetupJoinResponse = {
					type: "Pres:DatastoreUpdate",
					content: {
						"avgLatency": 10,
						"data": {
							"system:presence": {
								// Original response does not contain the requestor (attendeeId-4)
								// information (for efficiency). Note that the efficiency might be
								// compromising robust data and may change.
								"clientToSessionId": {
									[connectionId2]: {
										"rev": 0,
										"timestamp": initialTime,
										"value": attendeeId2,
									},
									[connectionId1]: {
										"rev": 0,
										"timestamp": 0,
										"value": attendeeId1,
									},
								},
							},
							"s:name:testWorkspace": {
								"latest": {
									[attendeeId1]: {
										"rev": 1,
										"timestamp": -20,
										"value": toOpaqueJson({ x: 1, y: 1, z: 1 }),
									},
								},
								"latestMap": {
									[attendeeId1]: {
										"rev": 1,
										"items": {
											"key1": {
												"rev": 1,
												"timestamp": -20,
												"value": toOpaqueJson({ a: 1, b: 1 }),
											},
											"key2": {
												"rev": 1,
												"timestamp": -20,
												"value": toOpaqueJson({ b: 1, d: 1 }),
											},
										},
									},
								},
							},
						},
						"isComplete": true,
						"sendTimestamp": clock.now,
					},
				} as const satisfies OutboundDatastoreUpdateMessage;
				{
					runtime.signalsExpected.push([expectedSetupJoinResponse]);
					presence.processSignal([], newAttendeeSignal, false);
				}
				// Pass a little time (to distinguish between signals)
				clock.tick(10);

				// Create State objects with validators
				const workspaceSetupTime = clock.now;
				const point3DValidatorFunction = createSpiedValidator<Point3D>((d: unknown) => {
					return typeof d === "object" ? (d as Point3D) : undefined;
				});
				const statesWorkspace = presence.states.getWorkspace("name:testWorkspace", {
					latest: StateFactory.latest({
						local: { x: 0, y: 0, z: 0 },
						validator: point3DValidatorFunction,
					}),
				});
				const latest = statesWorkspace.states.latest;
				const attendee1 = presence.attendees.getAttendee(attendeeId1);
				latest.getRemote(attendee1)?.value();

				const originalJoinResponseData = expectedSetupJoinResponse.content.data;
				const expectedJoinResponse = {
					type: "Pres:DatastoreUpdate",
					content: {
						"avgLatency": 10,
						"data": {
							"system:presence": {
								"clientToSessionId": {
									...originalJoinResponseData["system:presence"].clientToSessionId,
									// Original response does not contain the requestor information
									// (for efficiency), but this secondary request will have that
									// connection data. Note the the efficiency might be compromising
									// robust data and may change.
									[connectionId4]: {
										"rev": 0,
										"timestamp": initialTime - 20,
										"value": attendeeId4,
									},
								},
							},
							"s:name:testWorkspace": {
								"latest": {
									...originalJoinResponseData["s:name:testWorkspace"].latest,
									[attendeeId2]: {
										"rev": 0,
										"timestamp": workspaceSetupTime,
										"value": toOpaqueJson({ x: 0, y: 0, z: 0 }),
									},
								},
								"latestMap": {
									...originalJoinResponseData["s:name:testWorkspace"].latestMap,
								},
							},
						},
						"isComplete": true,
						"sendTimestamp": clock.now,
					},
				} as const satisfies OutboundDatastoreUpdateMessage;
				runtime.signalsExpected.push([expectedJoinResponse]);

				// Act & Verify - resend new attendee Join signal
				presence.processSignal([], newAttendeeSignal, false);
			});
		});
	});
});
