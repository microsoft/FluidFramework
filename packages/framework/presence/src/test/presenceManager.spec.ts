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

				const initialAttendeeSignalInfo: IAttendeeSignalInfo = {
					clientSessionId: attendeeSessionId,
					clientConnectionId: initialAttendeeConnectionId,
					fixedTime: clock.now - 50,
					averageLatency: 50,
					updateProviders: ["client2"],
				};
				const rejoinAttendeeSignalInfo: IAttendeeSignalInfo = {
					clientSessionId: attendeeSessionId,
					clientConnectionId: rejoinAttendeeConnectionId,
					fixedTime: clock.now - 20,
					averageLatency: 20,
					connectionOrder: 1,
					updateProviders: ["client2"],
					priorClientToSessionId: {
						[initialAttendeeConnectionId]: {
							rev: 0,
							timestamp: initialAttendeeSignalInfo.fixedTime,
							value: attendeeSessionId,
						},
					},
				};
				interface IAttendeeSignalInfo {
					clientSessionId: string;
					clientConnectionId: ClientConnectionId;
					fixedTime: number;
					averageLatency?: number;
					connectionOrder?: number;
					updateProviders?: string[];
					priorClientToSessionId?: Record<
						ClientConnectionId,
						{ rev: number; timestamp: number; value: string }
					>;
				}

				function simulateAttendeeJoin(
					attendeeSignalInfo: IAttendeeSignalInfo[],
				): ISessionClient[] {
					const joinedAttendees: ISessionClient[] = [];
					const signals = attendeeSignalInfo.map((info) => {
						return generateBasicClientJoin(info.fixedTime, {
							...info,
						});
					});

					const cleanUpListener = presence.events.on("attendeeJoined", (attendee) => {
						joinedAttendees.push(attendee);
					});

					afterCleanUp.push(cleanUpListener);

					for (const signal of signals) {
						presence.processSignal("", signal, false);
					}

					return joinedAttendees;
				}

				function verifyAttendee(
					attendee: ISessionClient,
					connectionId: ClientConnectionId,
					connectionStatus: SessionClientStatus = SessionClientStatus.Connected,
				): void {
					assert.equal(attendee.sessionId, attendeeSessionId, "Attendee has wrong session id");
					assert.equal(
						attendee.getConnectionId(),
						connectionId,
						"Attendee has wrong client connection id",
					);
					assert.equal(
						attendee.getConnectionStatus(),
						connectionStatus,
						"Attendee connection status is not Connected",
					);
				}

				beforeEach(() => {
					// Ignore submitted signals
					runtime.submitSignal = () => {};
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
						const joinedAttendees = simulateAttendeeJoin([initialAttendeeSignalInfo]);

						// Verify
						assert(
							joinedAttendees.length === 1 && joinedAttendees[0] !== undefined,
							"Expected exactly one attendee to be announced",
						);

						verifyAttendee(joinedAttendees[0], initialAttendeeConnectionId);
					});

					it('second time is announced once via `attendeeJoined` with status "Connected" when prior is unknown', () => {
						// Setup
						runtime.removeMember(initialAttendeeConnectionId);

						// Act - simulate join message from client
						const joinedAttendees = simulateAttendeeJoin([rejoinAttendeeSignalInfo]);

						// Verify
						assert(
							joinedAttendees.length === 1 && joinedAttendees[0] !== undefined,
							"Expected exactly one attendee to be announced",
						);

						verifyAttendee(joinedAttendees[0], rejoinAttendeeConnectionId);
					});

					it.skip('second time is announced once via `attendeeJoined` with status "Connected" when prior is still connected', () => {
						// Act - simulate join message from client
						const joinedAttendees = simulateAttendeeJoin([rejoinAttendeeSignalInfo]);

						// Verify
						assert(
							joinedAttendees.length === 1 && joinedAttendees[0] !== undefined,
							"Expected exactly one attendee to be announced",
						);

						verifyAttendee(joinedAttendees[0], rejoinAttendeeConnectionId);
					});

					it.skip('first time is announced via `attendeeJoined` with status "Connected" even if unknown to audience', () => {
						// Setup - remove connection from audience
						runtime.removeMember(initialAttendeeConnectionId);

						// Act - simulate join message from client
						const joinedAttendees = simulateAttendeeJoin([initialAttendeeSignalInfo]);

						// Verify
						assert(
							joinedAttendees.length === 1 && joinedAttendees[0] !== undefined,
							"Expected exactly one attendee to be announced",
						);

						verifyAttendee(joinedAttendees[0], initialAttendeeConnectionId);
					});

					it('second time is announced once via `attendeeJoined` with status "Connected" even if most recent unknown to audience', () => {
						// Setup - remove connection from audience
						runtime.removeMember(rejoinAttendeeConnectionId);

						// Act - simulate join message from client
						const joinedAttendees = simulateAttendeeJoin([rejoinAttendeeSignalInfo]);
						assert(
							joinedAttendees.length === 1 && joinedAttendees[0] !== undefined,
							"Expected exactly one attendee to be announced",
						);

						verifyAttendee(joinedAttendees[0], rejoinAttendeeConnectionId);
					});

					it("as collateral and disconnected is NOT announced via `attendeeJoined`", () => {
						// Setup - remove connections from audience
						const collateralAttendeeConnectionId = "client3";
						runtime.removeMember(initialAttendeeConnectionId);
						runtime.removeMember(collateralAttendeeConnectionId);
						const collateralAttendeeSignalInfo = {
							clientSessionId: attendeeSessionId,
							clientConnectionId: rejoinAttendeeConnectionId,
							connectionOrder: 1,
							fixedTime: clock.now - 10,
							updateProviders: ["client2"],
							priorClientToSessionId: {
								[initialAttendeeConnectionId]: {
									rev: 0,
									timestamp: initialAttendeeSignalInfo.fixedTime,
									value: attendeeSessionId,
								},
								[collateralAttendeeConnectionId]: {
									rev: 0,
									timestamp: 0,
									value: "collateral-id",
								},
							},
						};

						// Act - simulate join message from client
						const joinedAttendees = simulateAttendeeJoin([collateralAttendeeSignalInfo]);

						// Verify - only the rejoining attendee is announced
						assert(
							joinedAttendees.length === 1 && joinedAttendees[0] !== undefined,
							"Expected exactly one attendee to be announced",
						);

						verifyAttendee(joinedAttendees[0], rejoinAttendeeConnectionId);
					});

					it.skip("is announced via `attendeeJoined` when a second joining attendee is unknown to audience", () => {
						// SETUP - create attendee signals

						// Signal for second joining attendee
						const secondJoinSignalInfo = {
							clientSessionId: "sessionId-9",
							clientConnectionId: "client9", // Unknown to audience
							fixedTime: clock.now - 40,
							averageLatency: 10,
							updateProviders: ["client2"], // Join response is requested from the initial joining attendee
						};

						// Join response signal broadcasted from initial joining attendee (responding to the second joining attendee message sent above)
						const reponseSignalInfo = {
							clientSessionId: attendeeSessionId,
							clientConnectionId: initialAttendeeConnectionId,
							fixedTime: clock.now - 30,
							averageLatency: 20,
							// Include the prior client to session id mapping info for the second joining attendee
							priorClientToSessionId: {
								"client9": {
									rev: 0,
									timestamp: clock.now - 40,
									value: "sessionId-9",
								},
							},
						};

						// ACT - simulate join messages from clients
						// Order matters here: 1st client joins -> 2nd client joins -> 1st client responds to 2nd client joining
						const joinedAttendees: ISessionClient[] = simulateAttendeeJoin([
							initialAttendeeSignalInfo,
							secondJoinSignalInfo,
							reponseSignalInfo,
						]);

						// VERIFY
						assert(
							joinedAttendees.length === 2 &&
								joinedAttendees[0] !== undefined &&
								joinedAttendees[1] !== undefined,
							"Expected exactly two attendees to be announced",
						);

						verifyAttendee(joinedAttendees[0], initialAttendeeConnectionId);
						verifyAttendee(joinedAttendees[1], secondJoinSignalInfo.clientConnectionId);
					});
				});

				describe("that is already known", () => {
					let knownAttendee: ISessionClient | undefined;

					beforeEach(() => {
						// Setup known attendee
						const joinedAttendees = simulateAttendeeJoin([initialAttendeeSignalInfo]);
						assert(
							joinedAttendees.length === 1,
							"Expected exactly one attendee to be announced",
						);
						knownAttendee = joinedAttendees[0];
					});

					it('is NOT announced when "rejoined" with same connection (duplicate signal)', () => {
						clock.tick(10);
						// Act - simulate duplicate join message from client
						const joinedAttendees = simulateAttendeeJoin([initialAttendeeSignalInfo]);
						// Verify - no attendee should be announced for duplicate join message
						assert(
							joinedAttendees.length === 0,
							"No attendee should be announced for duplicate join message",
						);
					});

					// To retain symmetry across Joined and Disconnected events, do not announce
					// attendeeJoined when the attendee is already connected and we only see
					// a connection id update. This can happen when audience removal is late.
					it.skip('is not announced via `attendeeJoined` when already "Connected"', () => {
						// Act - simulate rejoin message from client
						const joinedAttendees = simulateAttendeeJoin([rejoinAttendeeSignalInfo]);
						// Verify - no attendee should be announced for rejoin message when known attendee is already connected
						assert(
							joinedAttendees.length === 0,
							"No attendee should be announced for rejoin message when known attendee is already connected",
						);
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
						const joinedAttendees = simulateAttendeeJoin([initialAttendeeSignalInfo]);
						assert(
							joinedAttendees.length === 1 && joinedAttendees[0] !== undefined,
							"Expected exactly one attendee to be announced",
						);
						priorAttendee = joinedAttendees[0];

						// Disconnect the attendee
						runtime.removeMember(initialAttendeeConnectionId);
					});

					it("is NOT announced when rejoined with same connection (duplicate signal)", () => {
						clock.tick(10);
						// Act - simulate duplicate join message from client
						const joinedAttendees = simulateAttendeeJoin([initialAttendeeSignalInfo]);
						// Verify - no attendee should be announced for duplicate join message
						assert(
							joinedAttendees.length === 0,
							"No attendee should be announced for duplicate join message",
						);
					});

					it("is announced when rejoined with different connection and current information is updated", () => {
						// Setup
						assert(priorAttendee !== undefined, "No attendee was set in beforeEach");

						clock.tick(20);

						// Act - simulate new join message from same client (without disconnect)
						simulateAttendeeJoin([rejoinAttendeeSignalInfo]);

						// Verify - session id is unchanged and connection id is updated
						verifyAttendee(priorAttendee, rejoinAttendeeConnectionId);
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
