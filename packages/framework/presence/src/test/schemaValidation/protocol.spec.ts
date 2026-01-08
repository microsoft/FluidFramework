/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import { describe, it, after, afterEach, before, beforeEach } from "mocha";
import { useFakeTimers, type SinonFakeTimers } from "sinon";

import { StateFactory } from "@fluidframework/presence/beta";

import type { PresenceWithNotifications } from "../../index.js";
import { toOpaqueJson } from "../../internalUtils.js";
import { broadcastJoinResponseDelaysMs } from "../../presenceDatastoreManager.js";
import type { OutboundDatastoreUpdateMessage } from "../../protocol.js";
import { MockEphemeralRuntime } from "../mockEphemeralRuntime.js";
import type { ProcessSignalFunction } from "../testUtils.js";
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

/**
 * Workspace updates
 */
interface Point3D {
	x: number;
	y: number;
	z: number;
}

describe("Presence", () => {
	describe("Runtime schema validation", () => {
		const afterCleanUp: (() => void)[] = [];
		const initialTime = 500;
		const attendee1ValueRevisionTimestamp = 600;
		const testStartTime = 1010;
		let localAttendee1ValueRevisionTimestamp: number;

		let clock: SinonFakeTimers;
		let logger: EventAndErrorTrackingLogger;
		let presence: PresenceWithNotifications;
		let processSignal: ProcessSignalFunction;
		let runtime: MockEphemeralRuntime;

		before(async () => {
			clock = useFakeTimers();
		});

		beforeEach(() => {
			logger = new EventAndErrorTrackingLogger();
			runtime = new MockEphemeralRuntime(logger);
			clock.setSystemTime(initialTime);

			// Create Presence joining session as attendeeId-2.
			let localAvgLatency: number;
			({ presence, processSignal, localAvgLatency } = prepareConnectedPresence(
				runtime,
				attendeeId2,
				connectionId2,
				clock,
				logger,
			));

			// Note that while the initialTime was set to 500, the prepareConnectedPresence call advances
			// it. Set a consistent start time for all tests.
			const deltaToStart = testStartTime - clock.now;
			assert(deltaToStart >= 10);
			clock.tick(deltaToStart - 10);

			// Process remote client update signal (attendeeId-1 is then part of local client's known session).
			const attendee1UpdateSendTimestamp = deltaToStart - 20;
			const attendee1AvgLatency = 20;
			const attendee1ToLocalTimeDelta =
				clock.now - (localAvgLatency + attendee1AvgLatency + attendee1UpdateSendTimestamp);
			localAttendee1ValueRevisionTimestamp =
				attendee1ValueRevisionTimestamp + attendee1ToLocalTimeDelta;
			processSignal(
				[],
				{
					type: "Pres:DatastoreUpdate",
					content: {
						sendTimestamp: attendee1UpdateSendTimestamp,
						avgLatency: attendee1AvgLatency,
						data: {
							"system:presence": {
								"clientToSessionId": {
									"client1": {
										"rev": 0,
										"timestamp": initialTime + 40,
										"value": attendeeId1,
									},
								},
							},
							"s:name:testWorkspace": {
								"latest": {
									[attendeeId1]: {
										"rev": 1,
										"timestamp": attendee1ValueRevisionTimestamp,
										"value": toOpaqueJson({ x: 1, y: 1, z: 1 }),
									},
								},
								"latestMap": {
									[attendeeId1]: {
										"rev": 1,
										"items": {
											"key1": {
												"rev": 1,
												"timestamp": attendee1ValueRevisionTimestamp,
												"value": toOpaqueJson({ a: 1, b: 1 }),
											},
											"key2": {
												"rev": 1,
												"timestamp": attendee1ValueRevisionTimestamp,
												// out of schema value
												"value": toOpaqueJson({ b: 1, d: 1 }),
											},
										},
									},
								},
							},
						},
					},
					clientId: "client1",
				},
				false,
			);

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
				const connectionId4 = "client4";
				const client4JoinTime = clock.now - 50;
				const newAttendeeSignal = generateBasicClientJoin(client4JoinTime, {
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
								"clientToSessionId": {
									[connectionId2]: {
										"rev": 0,
										"timestamp": initialTime,
										"value": attendeeId2,
									},
									[connectionId1]: {
										"rev": 0,
										"timestamp": initialTime + 40,
										"value": attendeeId1,
									},
									[connectionId4]: {
										"rev": 0,
										"timestamp": client4JoinTime,
										"value": attendeeId4,
									},
								},
							},
							"s:name:testWorkspace": {
								"latest": {
									[attendeeId1]: {
										"rev": 1,
										"timestamp": localAttendee1ValueRevisionTimestamp,
										"value": toOpaqueJson({ x: 1, y: 1, z: 1 }),
									},
								},
								"latestMap": {
									[attendeeId1]: {
										"rev": 1,
										"items": {
											"key1": {
												"rev": 1,
												"timestamp": localAttendee1ValueRevisionTimestamp,
												"value": toOpaqueJson({ a: 1, b: 1 }),
											},
											"key2": {
												"rev": 1,
												"timestamp": localAttendee1ValueRevisionTimestamp,
												"value": toOpaqueJson({ b: 1, d: 1 }),
											},
										},
									},
								},
							},
						},
						"isComplete": true,
						"joinResponseFor": [connectionId4],
						"sendTimestamp": clock.now + broadcastJoinResponseDelaysMs.namedResponder,
					},
				} as const satisfies OutboundDatastoreUpdateMessage;
				{
					runtime.signalsExpected.push([expectedSetupJoinResponse]);
					processSignal([], newAttendeeSignal, false);
					clock.tick(broadcastJoinResponseDelaysMs.namedResponder);
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
						settings: {
							// To prevent sending messages ahead of full broadcast from
							// join below, set the allowable latency to twice expected
							// join response time.
							allowableUpdateLatencyMs: 2 * broadcastJoinResponseDelaysMs.namedResponder,
						},
					}),
				});
				const latest = statesWorkspace.states.latest;
				const attendee1 = presence.attendees.getAttendee(attendeeId1);

				// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
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
						"joinResponseFor": [connectionId4],
						"sendTimestamp": clock.now + broadcastJoinResponseDelaysMs.namedResponder,
					},
				} as const satisfies OutboundDatastoreUpdateMessage;
				runtime.signalsExpected.push([expectedJoinResponse]);

				// Act & Verify - resend new attendee Join signal
				processSignal([], newAttendeeSignal, false);
				clock.tick(broadcastJoinResponseDelaysMs.namedResponder);
			});
		});
	});
});
