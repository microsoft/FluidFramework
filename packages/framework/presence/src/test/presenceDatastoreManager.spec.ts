/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import type { SinonFakeTimers } from "sinon";
import { useFakeTimers, spy } from "sinon";

import { createPresenceManager } from "../presenceManager.js";

import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";
import { assertFinalExpectations, prepareConnectedPresence } from "./testUtils.js";

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
			prepareConnectedPresence(runtime, "sessionId-2", "client2", clock, logger);
		});

		describe("responds to ClientJoin", () => {
			let presence: ReturnType<typeof createPresenceManager>;

			beforeEach(() => {
				presence = prepareConnectedPresence(runtime, "sessionId-2", "client2", clock, logger);

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
					"Pres:DatastoreUpdate",
					{
						"avgLatency": 10,
						"data": {
							"system:presence": {
								"clientToSessionId": {
									"client2": {
										"rev": 0,
										"timestamp": initialTime,
										"value": "sessionId-2",
									},
								},
							},
						},
						"isComplete": true,
						"sendTimestamp": clock.now,
					},
				]);

				// Act
				presence.processSignal(
					"",
					{
						type: "Pres:ClientJoin",
						content: {
							sendTimestamp: clock.now - 50,
							avgLatency: 50,
							data: {},
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
					"",
					{
						type: "Pres:ClientJoin",
						content: {
							sendTimestamp: clock.now - 20,
							avgLatency: 0,
							data: {},
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
					"Pres:DatastoreUpdate",
					{
						"avgLatency": 10,
						"data": {
							"system:presence": {
								"clientToSessionId": {
									"client2": {
										"rev": 0,
										"timestamp": initialTime,
										"value": "sessionId-2",
									},
								},
							},
						},
						"isComplete": true,
						"sendTimestamp": clock.now + 180,
					},
				]);

				// Act
				clock.tick(200);

				// Verify
				assertFinalExpectations(runtime, logger);
				// #endregion
			});
		});

		/**
		 * These tests are skipped as 'workspaceActivated' event is not yet implemented.
		 * TODO: Re-enable tests once {@link https://dev.azure.com/fluidframework/internal/_workitems/edit/29939} is completed
		 */
		describe.skip("receiving DatastoreUpdate", () => {
			let presence: ReturnType<typeof createPresenceManager>;

			const systemWorkspaceUpdate = {
				"system:presence": {
					"clientToSessionId": {
						"client1": {
							"rev": 0,
							"timestamp": 0,
							"value": "sessionId-1",
						},
					},
				},
			};
			const statesWorkspaceUpdate = {
				"s:name:testStateWorkspace": {
					"latest": {
						"sessionId-1": {
							"rev": 1,
							"timestamp": 0,
							"value": {},
						},
					},
				},
			};
			const notificationsWorkspaceUpdate = {
				"n:name:testNotificationWorkspace": {
					"testEvents": {
						"sessionId-1": {
							"rev": 0,
							"timestamp": 0,
							"value": {},
							"ignoreUnmonitored": true,
						},
					},
				},
			};

			beforeEach(() => {
				presence = prepareConnectedPresence(runtime, "sessionId-2", "client2", clock, logger);

				// Pass a little time (to mimic reality)
				clock.tick(10);
			});

			it("with unregistered States workspace emits 'workspaceActivated'", () => {
				// Setup
				const listener = spy();
				presence.events.on("workspaceActivated", listener);

				// Act
				presence.processSignal(
					"",
					{
						type: "Pres:DatastoreUpdate",
						content: {
							sendTimestamp: clock.now - 10,
							avgLatency: 20,
							data: {
								...systemWorkspaceUpdate,
								...statesWorkspaceUpdate,
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
					"",
					{
						type: "Pres:DatastoreUpdate",
						content: {
							sendTimestamp: clock.now - 10,
							avgLatency: 20,
							data: {
								...systemWorkspaceUpdate,
								...notificationsWorkspaceUpdate,
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
					"",
					{
						type: "Pres:DatastoreUpdate",
						content: {
							sendTimestamp: clock.now - 10,
							avgLatency: 20,
							data: {
								...systemWorkspaceUpdate,
								"u:name:testUnknownWorkspace": {
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

				// Verify
				assert.strictEqual(listener.calledOnce, true);
				assert.strictEqual(
					listener.calledWith("name:name:testUnknownWorkspace", "Unknown"),
					true,
				);
			});
			it("with registered workspace does NOT emit 'workspaceActivated'", () => {
				// Setup
				const listener = spy();
				presence.events.on("workspaceActivated", listener);
				presence.getStates("name:testStateWorkspace", {});
				presence.getNotifications("name:testNotificationWorkspace", {});

				// Act
				presence.processSignal(
					"",
					{
						type: "Pres:DatastoreUpdate",
						content: {
							sendTimestamp: clock.now - 10,
							avgLatency: 20,
							data: {
								...systemWorkspaceUpdate,
								...statesWorkspaceUpdate,
								...notificationsWorkspaceUpdate,
							},
						},
						clientId: "client1",
					},
					false,
				);

				// Verify
				assert.strictEqual(listener.called, false);
			});
		});
	});
});
