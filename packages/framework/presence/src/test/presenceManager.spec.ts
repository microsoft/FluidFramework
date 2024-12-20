/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import type { SinonFakeTimers } from "sinon";
import { useFakeTimers } from "sinon";

import type { ClientConnectionId } from "../baseTypes.js";
import { SessionClientStatus, type ISessionClient } from "../presence.js";
import { createPresenceManager } from "../presenceManager.js";

import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";
import {
	assertFinalExpectations,
	generateBasicClientJoin,
	prepareConnectedPresence,
} from "./testUtils.js";

describe("Presence", () => {
	describe("PresenceManager", () => {
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

		it("can be created", () => {
			// Act & Verify (does not throw)
			createPresenceManager(runtime);
		});

		it("creation logs initialization event", () => {
			// Setup
			logger.registerExpectedEvent({ eventName: "Presence:PresenceInstantiated" });

			// Act
			createPresenceManager(runtime);

			// Verify
			assertFinalExpectations(runtime, logger);
		});

		it("throws when unknown attendee is requested via `getAttendee`", () => {
			// Setup
			const presence = createPresenceManager(runtime);

			// Act & Verify
			assert.throws(() => presence.getAttendee("unknown"), /Attendee not found/);
		});

		describe("when connected", () => {
			let presence: ReturnType<typeof createPresenceManager>;
			const afterCleanUp: (() => void)[] = [];

			beforeEach(() => {
				presence = prepareConnectedPresence(runtime, "seassionId-2", "client2", clock, logger);
			});

			afterEach(() => {
				for (const cleanUp of afterCleanUp) {
					cleanUp();
				}
				afterCleanUp.length = 0;
			});

			describe("attendee", () => {
				const attendeeSessionId = "sessionId-4";
				const initialAttendeeConnectionId = "client4";
				// Note: this connection id exists in the mock runtime audience since
				// initialization, but should go unnoticed by the presence manager
				// until there is a join signal related to it.
				const rejoinAttendeeConnectionId = "client7";
				let initialAttendeeSignal: ReturnType<typeof generateBasicClientJoin>;
				let rejoinAttendeeSignal: ReturnType<typeof generateBasicClientJoin>;

				// Processes join signals and returns the attendees that were announced via `attendeeJoined`
				function processJoinSignals(
					signals: ReturnType<typeof generateBasicClientJoin>[],
				): ISessionClient[] {
					const joinedAttendees: ISessionClient[] = [];
					const cleanUpListener = presence.events.on("attendeeJoined", (attendee) => {
						joinedAttendees.push(attendee);
					});

					for (const signal of signals) {
						presence.processSignal("", signal, false);
					}

					cleanUpListener();
					return joinedAttendees;
				}

				function verifyAttendee(
					actualAttendee: ISessionClient,
					expectedConnectionId: ClientConnectionId,
					expectedSessionId: string,
					expectedConnectionStatus: SessionClientStatus = SessionClientStatus.Connected,
				): void {
					assert.equal(
						actualAttendee.sessionId,
						expectedSessionId,
						"Attendee has wrong session id",
					);
					assert.equal(
						actualAttendee.getConnectionId(),
						expectedConnectionId,
						"Attendee has wrong client connection id",
					);
					assert.equal(
						actualAttendee.getConnectionStatus(),
						expectedConnectionStatus,
						`Attendee connection status is not ${expectedConnectionStatus}`,
					);
				}

				beforeEach(() => {
					// Ignore submitted signals
					runtime.submitSignal = () => {};

					initialAttendeeSignal = generateBasicClientJoin(clock.now - 50, {
						averageLatency: 50,
						clientSessionId: attendeeSessionId,
						clientConnectionId: initialAttendeeConnectionId,
						updateProviders: ["client2"],
					});

					rejoinAttendeeSignal = generateBasicClientJoin(clock.now - 20, {
						averageLatency: 20,
						clientSessionId: attendeeSessionId, // Same session id
						clientConnectionId: rejoinAttendeeConnectionId, // Different connection id
						connectionOrder: 1,
						updateProviders: ["client2"],
						priorClientToSessionId:
							initialAttendeeSignal.content.data["system:presence"].clientToSessionId,
					});
				});

				it("is not announced via `attendeeDisconnected` when unknown connection is removed", () => {
					// Setup
					presence.events.on("attendeeDisconnected", () => {
						assert.fail(
							"`attendeeDisconnected` should not be emitted for unknown connection.",
						);
					});

					// Act & Verify - remove connection unknown to presence
					runtime.removeMember("client5");
				});

				describe("that is joining", () => {
					it('first time is announced via `attendeeJoined` with status "Connected"', () => {
						// Act - simulate join message from client
						const joinedAttendees = processJoinSignals([initialAttendeeSignal]);
						// Verify
						assert.strictEqual(
							joinedAttendees.length,
							1,
							"Expected exactly one attendee to be announced",
						);
						verifyAttendee(joinedAttendees[0], initialAttendeeConnectionId, attendeeSessionId);
					});

					it('second time is announced once via `attendeeJoined` with status "Connected" when prior is unknown', () => {
						// Setup
						runtime.removeMember(initialAttendeeConnectionId);

						// Act - simulate join message from client
						const joinedAttendees = processJoinSignals([rejoinAttendeeSignal]);

						// Verify
						assert.strictEqual(
							joinedAttendees.length,
							1,
							"Expected exactly one attendee to be announced",
						);
						verifyAttendee(joinedAttendees[0], rejoinAttendeeConnectionId, attendeeSessionId);
					});

					it.skip('second time is announced once via `attendeeJoined` with status "Connected" when prior is still connected', () => {
						// Act - simulate join message from client
						const joinedAttendees = processJoinSignals([rejoinAttendeeSignal]);

						// Verify
						assert.strictEqual(
							joinedAttendees.length,
							1,
							"Expected exactly one attendee to be announced",
						);

						verifyAttendee(joinedAttendees[0], rejoinAttendeeConnectionId, attendeeSessionId);
					});

					it.skip('first time is announced via `attendeeJoined` with status "Connected" even if unknown to audience', () => {
						// Setup - remove connection from audience
						runtime.removeMember(initialAttendeeConnectionId);

						// Act - simulate join message from client
						const joinedAttendees = processJoinSignals([initialAttendeeSignal]);

						// Verify
						assert.strictEqual(
							joinedAttendees.length,
							1,
							"Expected exactly one attendee to be announced",
						);

						verifyAttendee(joinedAttendees[0], initialAttendeeConnectionId, attendeeSessionId);
					});

					it('second time is announced once via `attendeeJoined` with status "Connected" even if most recent unknown to audience', () => {
						// Setup - remove connection from audience
						runtime.removeMember(rejoinAttendeeConnectionId);

						// Act - simulate join message from client
						const joinedAttendees = processJoinSignals([rejoinAttendeeSignal]);
						assert.strictEqual(
							joinedAttendees.length,
							1,
							"Expected exactly one attendee to be announced",
						);

						verifyAttendee(joinedAttendees[0], rejoinAttendeeConnectionId, attendeeSessionId);
					});

					it("as collateral and disconnected is NOT announced via `attendeeJoined`", () => {
						// Setup - remove connections from audience
						const collateralAttendeeConnectionId = "client3";
						const collateralAttendeeSignal = generateBasicClientJoin(clock.now - 10, {
							averageLatency: 40,
							clientSessionId: attendeeSessionId,
							clientConnectionId: rejoinAttendeeConnectionId,
							connectionOrder: 1,
							updateProviders: ["client2"],
							priorClientToSessionId: {
								...initialAttendeeSignal.content.data["system:presence"].clientToSessionId,
								[collateralAttendeeConnectionId]: {
									rev: 0,
									timestamp: 0,
									value: "collateral-id",
								},
							},
						});
						runtime.removeMember(initialAttendeeConnectionId);
						runtime.removeMember(collateralAttendeeConnectionId);

						// Act - simulate join message from client
						const joinedAttendees = processJoinSignals([collateralAttendeeSignal]);

						// Verify - only the rejoining attendee is announced
						assert.strictEqual(
							joinedAttendees.length,
							1,
							"Expected exactly one attendee to be announced",
						);

						verifyAttendee(joinedAttendees[0], rejoinAttendeeConnectionId, attendeeSessionId);
					});

					it.skip("as collateral with old connection info and connected is NOT announced via `attendeeJoined`", () => {
						// Setup - generate signals

						// Both connection Id's unkonwn to audience
						const oldAttendeeConnectionId = "client9";
						const newAttendeeConnectionId = "client10";

						// Rejoin signal for the collateral attendee unknown to audience
						const rejoinSignal = generateBasicClientJoin(clock.now - 10, {
							averageLatency: 40,
							clientSessionId: "collateral-id",
							clientConnectionId: newAttendeeConnectionId,
							updateProviders: [initialAttendeeConnectionId],
							connectionOrder: 1,
							priorClientToSessionId: {
								[oldAttendeeConnectionId]: {
									rev: 0,
									timestamp: 0,
									value: "collateral-id",
								},
							},
						});

						// Response signal sent by the initial attendee responding to the collateral attendees rejoin signal
						const responseSignal = generateBasicClientJoin(clock.now - 5, {
							averageLatency: 20,
							clientSessionId: attendeeSessionId,
							clientConnectionId: initialAttendeeConnectionId,
							priorClientToSessionId: {
								...initialAttendeeSignal.content.data["system:presence"].clientToSessionId,
								// Old connection id of rejoining attendee
								// This should be ignored by local client
								[oldAttendeeConnectionId]: {
									rev: 0,
									timestamp: 0,
									value: "collateral-id",
								},
							},
						});

						// Process initial join signal so initial attendee is known
						const joinedAttendees = processJoinSignals([initialAttendeeSignal]);
						assert.strictEqual(
							joinedAttendees.length,
							1,
							"Expected exactly one attendee to be announced",
						);

						// Simulate rejoin message from remote client
						const rejoinAttendees = processJoinSignals([rejoinSignal]);
						// Confirm that rejoining attendee is announced so we can verify it remains the same after response
						assert.strictEqual(
							rejoinAttendees.length,
							1,
							"Expected exactly one attendee to be announced",
						);

						// Act - simulate response message from remote client
						const responseAttendees = processJoinSignals([responseSignal]);

						// Verify - No collateral attendee should be announced by response signal and rejoined attendee information should remain unchanged
						assert.strictEqual(
							responseAttendees.length,
							0,
							"Expected no attendees to be announced",
						);
						// Check attendee information remains unchanged
						verifyAttendee(rejoinAttendees[0], newAttendeeConnectionId, "collateral-id");
					});
				});

				describe("that is already known", () => {
					let knownAttendee: ISessionClient | undefined;

					beforeEach(() => {
						// Setup known attendee
						const joinedAttendees = processJoinSignals([initialAttendeeSignal]);
						assert(
							joinedAttendees.length === 1,
							"Expected exactly one attendee to be announced",
						);
						knownAttendee = joinedAttendees[0];
					});

					it('is NOT announced when "rejoined" with same connection (duplicate signal)', () => {
						afterCleanUp.push(
							presence.events.on("attendeeJoined", (attendee) => {
								assert.fail(
									"Attendee should not be announced when rejoining with same connection",
								);
							}),
						);

						clock.tick(10);
						// Act & Verify - simulate duplicate join message from client
						processJoinSignals([initialAttendeeSignal]);
					});

					// To retain symmetry across Joined and Disconnected events, do not announce
					// attendeeJoined when the attendee is already connected and we only see
					// a connection id update. This can happen when audience removal is late.
					it.skip('is not announced via `attendeeJoined` when already "Connected"', () => {
						// Setup
						afterCleanUp.push(
							presence.events.on("attendeeJoined", () => {
								assert.fail("No attendee should be announced in join processing");
							}),
						);
						// Act & Verify - simulate rejoin message from client
						processJoinSignals([rejoinAttendeeSignal]);
					});

					for (const [status, setup] of [
						[SessionClientStatus.Connected, () => {}] as const,
						[
							SessionClientStatus.Disconnected,
							() => runtime.removeMember(initialAttendeeConnectionId),
						] as const,
					]) {
						for (const [desc, id] of [
							["connection id", initialAttendeeConnectionId] as const,
							["session id", attendeeSessionId] as const,
						]) {
							it(`with status "${status}" is available from \`getAttendee\` by ${desc}`, () => {
								// Setup
								setup();

								// Act
								const attendee = presence.getAttendee(id);

								// Verify
								assert.equal(attendee, knownAttendee, "`getAttendee` returned wrong attendee");
								assert.equal(
									attendee.getConnectionStatus(),
									status,
									"`getAttendee` returned attendee with wrong status",
								);
							});
						}

						it(`with status "${status}" is available from \`getAttendees\``, () => {
							// Setup
							assert(knownAttendee !== undefined, "No attendee was set in beforeEach");
							setup();

							// Act
							const attendees = presence.getAttendees();
							assert(
								attendees.has(knownAttendee),
								"`getAttendees` set does not contain attendee",
							);
							assert.equal(
								knownAttendee.getConnectionStatus(),
								status,
								"`getAttendees` set contains attendee with wrong status",
							);
						});
					}

					// When local client disconnects, we lose the connectivity status updates for remote attendees in the session.
					// Upon reconnect, we mark all remote attendees connections as "stale".
					// Remote attendees with stale connections are given 30 seconds after local reconnection to show signs of life
					// before their connection status set to "Disconnected".
					// If an attendee with a stale connection becomes active, their "stale" status is removed.
					describe("and then local client disconnects", () => {
						let disconnectedAttendees: ISessionClient[];
						beforeEach(() => {
							// Setup
							assert(knownAttendee !== undefined, "No attendee was set in beforeEach");
							disconnectedAttendees = [];
							afterCleanUp.push(
								presence.events.on("attendeeDisconnected", (attendee) => {
									disconnectedAttendees.push(attendee);
								}),
							);
						});

						it.skip("updates status of attendee with stale connection to 'Disconnected' after 30s delay upon local reconnection", () => {
							assert(knownAttendee !== undefined, "No attendee was set in beforeEach");

							// Act - disconnect & reconnect local client
							runtime.disconnect(); // Simulate local client disconnect
							clock.tick(1000);
							runtime.connect("client6"); // Simulate local client reconnect with new connection id

							// Verify - stale attendee should still be 'Connected' after 15 seconds
							clock.tick(15_001);
							assert.strictEqual(
								knownAttendee.getConnectionStatus(),
								SessionClientStatus.Connected,
								"Stale attendee should still be 'Connected' after 15s",
							);

							// Verify - stale attendee should be 'Disconnected' after 30 seconds and announced via `attendeeDisconnected`
							clock.tick(15_001);
							assert.strictEqual(
								knownAttendee.getConnectionStatus(),
								SessionClientStatus.Disconnected,
								"Stale attendee should be 'Disconnected' 30s after reconnection",
							);
							assert.strictEqual(
								disconnectedAttendees.length,
								1,
								"Exactly one attendee should be announced as disconnected",
							);
						});

						it.skip("does not update status of attendee with stale connection if local client does not reconnect", () => {
							assert(knownAttendee !== undefined, "No attendee was set in beforeEach");

							// Act - disconnect local client and advance timer
							runtime.disconnect();
							clock.tick(600_000);

							// Verify - stale attendee should still be 'Connected' if local client never reconnects
							assert.strictEqual(
								knownAttendee.getConnectionStatus(),
								SessionClientStatus.Connected,
								"Stale attendee should still be 'Connected' after 30s",
							);
						});

						it.skip("does not update status of attendee with stale connection if local client reconnection lasts less than 30s", () => {
							assert(knownAttendee !== undefined, "No attendee was set in beforeEach");

							// Act - disconnect, reconnect for 15 second, disconnect local client again, then advance timer
							runtime.disconnect(); // First disconnect
							clock.tick(1000);
							runtime.connect("client6"); // Reconnect
							clock.tick(15_000); // Advance 15 seconds
							runtime.disconnect(); // Disconnect again
							clock.tick(600_000); // Advance 10 minutes

							// Verify - stale attendee should still be 'Connected' if local client never reconnects for at least 30s
							assert.strictEqual(
								knownAttendee.getConnectionStatus(),
								SessionClientStatus.Connected,
								"Stale attendee should still be 'Connected' after 30s",
							);
						});

						it.skip("does not update status of attendee with stale connection to 'Disconnected' if attendee rejoins", () => {
							assert(knownAttendee !== undefined, "No attendee was set in beforeEach");

							// Setup - fail if attendee joined is announced
							afterCleanUp.push(
								presence.events.on("attendeeJoined", () => {
									assert.fail(
										"No `attendeeJoined` should be announced for rejoining attendee that's already 'Connected'",
									);
								}),
							);

							// Act - disconnect, reconnect, process rejoin signal from known attendee after 15s, then advance timer
							runtime.disconnect();
							clock.tick(1000);
							runtime.connect("client6");
							clock.tick(15_000);
							processJoinSignals([rejoinAttendeeSignal]);
							clock.tick(600_000);

							// Verify - rejoining attendee should still be 'Connected' with no `attendeeJoined` announced
							assert.strictEqual(
								knownAttendee.getConnectionStatus(),
								SessionClientStatus.Connected,
								"Active attendee should still be 'Connected' 30s after reconnection",
							);
						});

						it.skip("does not update status of attendee with stale connection to 'Disconnected' if attendee sends datastore update", () => {
							assert(knownAttendee !== undefined, "No attendee was set in beforeEach");

							// Setup - fail if attendee joined is announced
							afterCleanUp.push(
								presence.events.on("attendeeJoined", () => {
									assert.fail(
										"No `attendeeJoined` should be announced for active attendee that's already 'Connected'",
									);
								}),
							);

							// Act - disconnect, reconnect, process datatstore update signal from known attendee before 30s delay, then advance timer
							runtime.disconnect();
							clock.tick(1000);
							runtime.connect("client6");
							clock.tick(15_000);
							presence.processSignal(
								"",
								{
									type: "Pres:DatastoreUpdate",
									content: {
										sendTimestamp: clock.now - 10,
										avgLatency: 20,
										data: {
											"system:presence": {
												clientToSessionId:
													initialAttendeeSignal.content.data["system:presence"]
														.clientToSessionId,
											},
										},
									},
									clientId: initialAttendeeConnectionId,
								},
								false,
							);
							clock.tick(600_000);

							// Verify - active attendee should still be 'Connected'
							assert.strictEqual(
								knownAttendee.getConnectionStatus(),
								SessionClientStatus.Connected,
								"Active attendee should still be 'Connected' 30s after reconnection",
							);
						});

						it.skip("marks attendee with stale conneciton as active when attendee disconnects after local reconnection", () => {
							assert(knownAttendee !== undefined, "No attendee was set in beforeEach");

							// Setup - initial attendee joins before local client disconnects
							processJoinSignals([initialAttendeeSignal]);

							// Act - disconnect, reconnect, remove remote client connection, then advance timer
							runtime.disconnect();
							clock.tick(1000);
							runtime.connect("client6");
							clock.tick(15_001);
							runtime.audience.removeMember(initialAttendeeConnectionId); // Remove remote client connection before 30s timeout
							// Confirm that `attendeeDisconnected` is announced for when active attendee disconnects
							assert.strictEqual(
								disconnectedAttendees.length,
								1,
								"Exactly one attendee should be announced as disconnected",
							);
							clock.tick(600_000);

							// Verify - active attendee status should be 'Disconnected' and no other `attendeeDisconnected` should be announced.
							assert.strictEqual(
								knownAttendee.getConnectionStatus(),
								SessionClientStatus.Disconnected,
								"Attendee should be 'Disconnected'",
							);
							assert.strictEqual(
								disconnectedAttendees.length,
								1,
								"Exactly one attendee should be announced as disconnected",
							);
						});

						it.skip("updates status of attendee with stale connection to 'Disconnected' only 30s after most recent local reconnection", () => {
							// Setup
							assert(knownAttendee !== undefined, "No attendee was set in beforeEach");
							assert.strictEqual(
								knownAttendee.getConnectionStatus(),
								SessionClientStatus.Connected,
								"Known attendee is not connected",
							);

							// Act - disconnect & reconnect local client multiple times with 15s delay
							runtime.disconnect();
							clock.tick(1000);
							runtime.connect("client6");

							clock.tick(15_001);

							runtime.disconnect();
							clock.tick(1000);
							runtime.connect("client7");

							// Verify - stale attendee should still be connected after 15 seconds
							clock.tick(15_001);
							assert.strictEqual(
								knownAttendee.getConnectionStatus(),
								SessionClientStatus.Connected,
								"Stale attendee should still be connected",
							);

							// Verify - stale attendee should be disconnected after 30 seconds
							clock.tick(15_001);
							assert.equal(
								knownAttendee.getConnectionStatus(),
								SessionClientStatus.Disconnected,
								"Stale attendee has wrong status",
							);
							assert.strictEqual(
								disconnectedAttendees.length,
								1,
								"Exactly one attendee should be announced as disconnected",
							);
						});
					});

					describe("and has their connection removed", () => {
						it("is announced via `attendeeDisconnected`", () => {
							// Setup
							assert(knownAttendee !== undefined, "No attendee was set in beforeEach");
							let disconnectedAttendee: ISessionClient | undefined;
							afterCleanUp.push(
								presence.events.on("attendeeDisconnected", (attendee) => {
									assert(
										disconnectedAttendee === undefined,
										"Only one attendee should be disconnected",
									);
									disconnectedAttendee = attendee;
								}),
							);

							// Act - remove client connection id
							runtime.removeMember(initialAttendeeConnectionId);

							// Verify
							assert(
								disconnectedAttendee !== undefined,
								"No attendee was disconnected during `removeMember`",
							);
							verifyAttendee(
								disconnectedAttendee,
								initialAttendeeConnectionId,
								attendeeSessionId,
								SessionClientStatus.Disconnected,
							);
						});

						it('is not announced via `attendeeDisconnected` when already "Disconnected"', () => {
							// Setup

							const clientToDisconnect = runtime.audience.getMember(
								initialAttendeeConnectionId,
							);
							assert(clientToDisconnect !== undefined, "No client to disconnect");

							// Remove client connection id
							runtime.removeMember(initialAttendeeConnectionId);

							afterCleanUp.push(
								presence.events.on("attendeeDisconnected", (attendee) => {
									assert.fail(
										"`attendeeDisconnected` should not be emitted for already disconnected attendee",
									);
								}),
							);

							// Act & Verify - fake event to remove client connection id again
							runtime.audience.emit(
								"removeMember",
								initialAttendeeConnectionId,
								clientToDisconnect,
							);
						});
					});
				});

				describe("that is rejoining", () => {
					let priorAttendee: ISessionClient | undefined;
					beforeEach(() => {
						// Setup prior attendee
						const joinedAttendees = processJoinSignals([initialAttendeeSignal]);
						assert(
							joinedAttendees.length === 1 && joinedAttendees[0] !== undefined,
							"Expected exactly one attendee to be announced",
						);
						priorAttendee = joinedAttendees[0];

						// Disconnect the attendee
						runtime.removeMember(initialAttendeeConnectionId);
					});

					it("is NOT announced when rejoined with same connection (duplicate signal)", () => {
						// Setup
						afterCleanUp.push(
							presence.events.on("attendeeJoined", (attendee) => {
								assert.fail(
									"Attendee should not be announced when rejoining with same connection",
								);
							}),
						);

						clock.tick(10);
						// Act & Verify - simulate duplicate join message from client
						processJoinSignals([initialAttendeeSignal]);
					});

					it("is announced when rejoined with different connection and current information is updated", () => {
						// Setup
						assert(priorAttendee !== undefined, "No attendee was set in beforeEach");

						clock.tick(20);

						// Act - simulate new join message from same client (without disconnect)
						processJoinSignals([rejoinAttendeeSignal]);

						// Verify - session id is unchanged and connection id is updated
						verifyAttendee(priorAttendee, rejoinAttendeeConnectionId, attendeeSessionId);
						// Attendee is available via new connection id
						const attendeeViaUpdatedId = presence.getAttendee(rejoinAttendeeConnectionId);
						assert.equal(
							attendeeViaUpdatedId,
							priorAttendee,
							"getAttendee returned wrong attendee for updated connection id",
						);
						// Attendee is available via old connection id
						const attendeeViaOriginalId = presence.getAttendee(initialAttendeeConnectionId);
						assert.equal(
							attendeeViaOriginalId,
							priorAttendee,
							"getAttendee returned wrong attendee for original connection id",
						);
					});
				});
			});
		});
	});
});
