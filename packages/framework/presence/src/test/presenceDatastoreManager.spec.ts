/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import type { SinonFakeTimers } from "sinon";
import { useFakeTimers, spy } from "sinon";

import { serializableToOpaqueJson } from "../internalUtils.js";
import type { AttendeeId } from "../presence.js";
import { createPresenceManager } from "../presenceManager.js";
import type { SystemWorkspaceDatastore } from "../systemWorkspace.js";

import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";
import {
	assertFinalExpectations,
	connectionId2,
	createSpecificAttendeeId,
	prepareConnectedPresence,
	attendeeId1,
	attendeeId2,
} from "./testUtils.js";

const attendee4SystemWorkspaceDatastore = {
	"clientToSessionId": {
		["client4" as AttendeeId]: {
			"rev": 0,
			"timestamp": 700,
			"value": serializableToOpaqueJson(createSpecificAttendeeId("attendeeId-4")),
		},
	},
} as const satisfies SystemWorkspaceDatastore;

describe("Presence", () => {
	describe("protocol handling", () => {
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

		it("does not signal when disconnected during initialization", () => {
			// Act & Verify
			createPresenceManager(runtime);
		});

		it("sends join when connected during initialization", () => {
			// Setup, Act (call to createPresenceManager), & Verify (post createPresenceManager call)
			prepareConnectedPresence(runtime, "attendeeId-2", "client2", clock, logger);
		});

		describe("responds to ClientJoin", () => {
			let presence: ReturnType<typeof createPresenceManager>;

			beforeEach(() => {
				presence = prepareConnectedPresence(runtime, "attendeeId-2", "client2", clock, logger);

				// Pass a little time (to mimic reality)
				clock.tick(10);
			});

			it("with broadcast immediately when preferred responder", () => {
				// Setup
				logger.registerExpectedEvent({
					eventName: "Presence:JoinResponse",
					details: JSON.stringify({
						type: "broadcastAll",
						requestor: "client4",
						role: "primary",
					}),
				});
				runtime.signalsExpected.push([
					{
						type: "Pres:DatastoreUpdate",
						content: {
							"avgLatency": 10,
							"data": {
								"system:presence": {
									"clientToSessionId": {
										[connectionId2]: {
											"rev": 0,
											"timestamp": initialTime,
											"value": serializableToOpaqueJson(attendeeId2),
										},
									},
								},
							},
							"isComplete": true,
							"sendTimestamp": clock.now,
						},
					},
				]);

				// Act
				presence.processSignal(
					[],
					{
						type: "Pres:ClientJoin",
						content: {
							sendTimestamp: clock.now - 50,
							avgLatency: 50,
							data: {
								"system:presence": attendee4SystemWorkspaceDatastore,
							},
							updateProviders: ["client2"],
						},
						clientId: "client4",
					},
					false,
				);

				// Verify
				assertFinalExpectations(runtime, logger);
			});

			it("with broadcast after delay when NOT preferred responder", () => {
				// #region Part 1 (no response)
				// Act
				presence.processSignal(
					[],
					{
						type: "Pres:ClientJoin",
						content: {
							sendTimestamp: clock.now - 20,
							avgLatency: 0,
							data: {
								"system:presence": attendee4SystemWorkspaceDatastore,
							},
							updateProviders: ["client0", "client1"],
						},
						clientId: "client4",
					},
					false,
				);
				// #endregion

				// #region Part 2 (response after delay)
				// Setup
				logger.registerExpectedEvent({
					eventName: "Presence:JoinResponse",
					details: JSON.stringify({
						type: "broadcastAll",
						requestor: "client4",
						role: "secondary",
						order: 2,
					}),
				});
				runtime.signalsExpected.push([
					{
						type: "Pres:DatastoreUpdate",
						content: {
							"avgLatency": 10,
							"data": {
								"system:presence": {
									"clientToSessionId": {
										...attendee4SystemWorkspaceDatastore.clientToSessionId,
										[connectionId2]: {
											"rev": 0,
											"timestamp": initialTime,
											"value": serializableToOpaqueJson(attendeeId2),
										},
									},
								},
							},
							"isComplete": true,
							"sendTimestamp": clock.now + 180,
						},
					},
				]);

				// Act
				clock.tick(200);

				// Verify
				assertFinalExpectations(runtime, logger);
				// #endregion
			});
		});

		describe("receiving DatastoreUpdate", () => {
			let presence: ReturnType<typeof createPresenceManager>;

			const systemWorkspaceUpdate = {
				"clientToSessionId": {
					"client1": {
						"rev": 0,
						"timestamp": 0,
						"value": serializableToOpaqueJson(attendeeId1),
					},
				},
			};

			const statesWorkspaceUpdate = {
				"latest": {
					[attendeeId1]: {
						"rev": 1,
						"timestamp": 0,
						"value": serializableToOpaqueJson({}),
					},
				},
			};

			const notificationsWorkspaceUpdate = {
				"testEvents": {
					[attendeeId1]: {
						"rev": 0,
						"timestamp": 0,
						"value": serializableToOpaqueJson({}),
						"ignoreUnmonitored": true,
					},
				},
			} as const;

			beforeEach(() => {
				presence = prepareConnectedPresence(
					runtime,
					attendeeId2,
					connectionId2,
					clock,
					logger,
				);

				// Pass a little time (to mimic reality)
				clock.tick(10);
			});

			it("with unregistered States workspace emits 'workspaceActivated'", () => {
				// Setup
				const listener = spy();
				presence.events.on("workspaceActivated", listener);

				// Act
				presence.processSignal(
					[],
					{
						type: "Pres:DatastoreUpdate",
						content: {
							sendTimestamp: clock.now - 10,
							avgLatency: 20,
							data: {
								"system:presence": systemWorkspaceUpdate,
								"s:name:testStateWorkspace": statesWorkspaceUpdate,
							},
						},
						clientId: "client1",
					},
					false,
				);

				// Verify
				assert.strictEqual(listener.calledOnce, true);
				assert.strictEqual(listener.calledWith("name:testStateWorkspace", "States"), true);
			});

			it("with unregistered Notifications workspace 'workspaceActivated'", () => {
				// Setup
				const listener = spy();
				presence.events.on("workspaceActivated", listener);

				// Act
				presence.processSignal(
					[],
					{
						type: "Pres:DatastoreUpdate",
						content: {
							sendTimestamp: clock.now - 10,
							avgLatency: 20,
							data: {
								"system:presence": systemWorkspaceUpdate,
								"n:name:testNotificationWorkspace": notificationsWorkspaceUpdate,
							},
						},
						clientId: "client1",
					},
					false,
				);

				// Verify
				assert.strictEqual(listener.calledOnce, true);
				assert.strictEqual(
					listener.calledWith("name:testNotificationWorkspace", "Notifications"),
					true,
				);
			});

			it("with unregistered workspace of unknown type emits 'workspaceActivated'", () => {
				// Setup
				const listener = spy();
				presence.events.on("workspaceActivated", listener);

				// Act
				presence.processSignal(
					[],
					{
						type: "Pres:DatastoreUpdate",
						content: {
							sendTimestamp: clock.now - 10,
							avgLatency: 20,
							data: {
								"system:presence": systemWorkspaceUpdate,
								"u:name:testUnknownWorkspace": {
									"latest": {
										[attendeeId1]: {
											"rev": 1,
											"timestamp": 0,
											"value": serializableToOpaqueJson({ x: 1, y: 1, z: 1 }),
										},
									},
								},
							},
						},
						clientId: "client1",
					},
					false,
				);

				// Verify
				assert.strictEqual(listener.calledOnce, true);
				assert.strictEqual(listener.calledWith("name:testUnknownWorkspace", "Unknown"), true);
			});

			it("with registered workspace does NOT emit 'workspaceActivated'", () => {
				// Setup
				const listener = spy();
				presence.events.on("workspaceActivated", listener);
				presence.states.getWorkspace("name:testStateWorkspace", {});
				presence.notifications.getWorkspace("name:testNotificationWorkspace", {});

				// Act
				presence.processSignal(
					[],
					{
						type: "Pres:DatastoreUpdate",
						content: {
							sendTimestamp: clock.now - 10,
							avgLatency: 20,
							data: {
								"system:presence": systemWorkspaceUpdate,
								"s:name:testStateWorkspace": statesWorkspaceUpdate,
								"n:name:testNotificationWorkspace": notificationsWorkspaceUpdate,
							},
						},
						clientId: "client1",
					},
					false,
				);

				// Verify
				assert.strictEqual(listener.called, false);
			});

			it("with workspace that has an unrecognized internal address does NOT emit 'workspaceActivated'", () => {
				// Setup
				const listener = spy();
				presence.events.on("workspaceActivated", listener);

				// Act
				presence.processSignal(
					[],
					{
						type: "Pres:DatastoreUpdate",
						content: {
							sendTimestamp: clock.now - 10,
							avgLatency: 20,
							data: {
								"system:presence": systemWorkspaceUpdate,
								// Unrecognized internal address
								"sn:name:testStateWorkspace": statesWorkspaceUpdate,
							},
						},
						clientId: "client1",
					},
					false,
				);

				// Verify
				assert.strictEqual(listener.called, false);
			});

			it("with workspace that has an invalid public address does NOT emit 'workspaceActivated'", () => {
				// Setup
				const listener = spy();
				presence.events.on("workspaceActivated", listener);

				// Act
				presence.processSignal(
					[],
					{
						type: "Pres:DatastoreUpdate",
						content: {
							sendTimestamp: clock.now - 10,
							avgLatency: 20,
							data: {
								"system:presence": systemWorkspaceUpdate,
								// Invalid public address (must be `${string}:${string}`)
								"s:testStateWorkspace": statesWorkspaceUpdate,
							},
						},
						clientId: "client1",
					},
					false,
				);

				// Verify
				assert.strictEqual(listener.called, false);
			});

			it("with workspace that has already been seen does NOT emit 'workspaceActivated'", () => {
				// Setup
				const listener = spy();
				presence.events.on("workspaceActivated", listener);

				// Act
				presence.processSignal(
					[],
					{
						type: "Pres:DatastoreUpdate",
						content: {
							sendTimestamp: clock.now - 20,
							avgLatency: 20,
							data: {
								"system:presence": systemWorkspaceUpdate,
								"s:name:testStateWorkspace": statesWorkspaceUpdate,
							},
						},
						clientId: "client1",
					},
					false,
				);
				presence.processSignal(
					[],
					{
						type: "Pres:DatastoreUpdate",
						content: {
							sendTimestamp: clock.now - 10,
							avgLatency: 20,
							data: {
								"system:presence": systemWorkspaceUpdate,
								"s:name:testStateWorkspace": statesWorkspaceUpdate,
							},
						},
						clientId: "client1",
					},
					false,
				);
				// Verify
				assert.strictEqual(listener.callCount, 1);
			});

			it("with acknowledgementId sends targeted acknowledgment messsage back to requestor", () => {
				// We expect to send a targeted acknowledgment back to the requestor
				runtime.signalsExpected.push([
					{
						type: "Pres:Ack",
						content: { id: "ackID" },
						targetClientId: "client4",
					},
				]);

				// Act - send generic datastore update with acknowledgement id specified
				presence.processSignal(
					[],
					{
						type: "Pres:DatastoreUpdate",
						content: {
							sendTimestamp: clock.now - 10,
							avgLatency: 20,
							data: {
								"system:presence": systemWorkspaceUpdate,
								"s:name:testStateWorkspace": statesWorkspaceUpdate,
							},
							acknowledgementId: "ackID",
						},
						clientId: "client4",
					},
					false,
				);

				// Verify
				assertFinalExpectations(runtime, logger);
			});
		});
	});
});
