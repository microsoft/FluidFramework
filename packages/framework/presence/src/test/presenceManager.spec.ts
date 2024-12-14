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
						"Attendee connection status is not Connected",
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
