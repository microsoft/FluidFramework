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
				interface IAttendeeSignalInfo {
					fixedTime?: number;
					clientSessionId: string;
					clientConnectionId: ClientConnectionId;
					averageLatency?: number;
					connectionOrder?: number;
					updateProviders?: string[];
					priorClientToSessionId?: Record<
						ClientConnectionId,
						{ rev: number; timestamp: number; value: string }
					>;
				}
				// Helper function to set up attendee(s)
				function sendAttendeeSignals(attendeesInfo: IAttendeeSignalInfo[]): {
					attendees: ISessionClient[];
					verifyAttendees: (
						expectedSessionIds: string[],
						expectedConnectionIds: string[],
						expectedStatuses: SessionClientStatus[],
					) => void;
				} {
					const attendees: ISessionClient[] = [];
					const signals = attendeesInfo.map((info) =>
						generateBasicClientJoin(info.fixedTime ?? clock.now - 50, {
							averageLatency: info.averageLatency ?? 50,
							clientSessionId: info.clientSessionId ?? "sessionId-4",
							clientConnectionId: info.clientConnectionId ?? "client4",
							connectionOrder: info.connectionOrder ?? 0,
							updateProviders: info.updateProviders ?? ["client2"],
							priorClientToSessionId: info.priorClientToSessionId ?? {},
						}),
					);

					const cleanUpListener = presence.events.on("attendeeJoined", (attendee) => {
						attendees.push(attendee);
					});
					afterCleanUp.push(cleanUpListener);

					for (const signal of signals) {
						presence.processSignal("", signal, false);
					}

					function verifyAttendees(
						expectedSessionIds: string[],
						expectedConnectionIds: string[],
						expectedStatuses: SessionClientStatus[],
					): void {
						assert.equal(
							attendees.length,
							expectedStatuses.length,
							"Incorrect number of attendees",
						);
						for (const [index, attendee] of attendees.entries()) {
							assert.equal(
								attendee.getConnectionId(),
								expectedConnectionIds[index],
								`Incorrect connection id for attendee ${attendee.sessionId}`,
							);
							assert.equal(
								attendee.sessionId,
								expectedSessionIds[index],
								`Incorrect session id for attendee ${attendee.sessionId}`,
							);
							assert.equal(
								attendee.getConnectionStatus(),
								expectedStatuses[index],
								`Incorrect status for attendee ${attendee.sessionId}`,
							);
						}
					}

					return { attendees, verifyAttendees };
				}
				let initialAttedeeSignal: IAttendeeSignalInfo;
				let rejoinAttendeeSignal: IAttendeeSignalInfo;

				beforeEach(() => {
					// Ignore submitted signals
					runtime.submitSignal = () => {};

					initialAttedeeSignal = {
						fixedTime: clock.now - 50,
						averageLatency: 50,
						clientSessionId: "sessionId-4",
						clientConnectionId: "client4",
						updateProviders: ["client2"],
					};

					rejoinAttendeeSignal = {
						fixedTime: clock.now - 20,
						averageLatency: 20,
						clientSessionId: "sessionId-4", // Same session id
						clientConnectionId: "client7", // Different connection id
						connectionOrder: 1,
						updateProviders: ["client2"],
						priorClientToSessionId: {
							"client4": {
								rev: 0,
								timestamp: clock.now - 50,
								value: "sessionId-4",
							},
						},
					};
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
						// Setup
						const { verifyAttendees } = sendAttendeeSignals([initialAttedeeSignal]);

						// Verify
						verifyAttendees(
							[initialAttedeeSignal.clientSessionId],
							[initialAttedeeSignal.clientConnectionId],
							[SessionClientStatus.Connected],
						);
					});

					it('second time is announced once via `attendeeJoined` with status "Connected" when prior is unknown', () => {
						// Setup
						runtime.removeMember(initialAttedeeSignal.clientConnectionId);
						const { verifyAttendees } = sendAttendeeSignals([rejoinAttendeeSignal]);

						// Verify
						verifyAttendees(
							[rejoinAttendeeSignal.clientSessionId],
							[rejoinAttendeeSignal.clientConnectionId],
							[SessionClientStatus.Connected],
						);
					});

					it('second time is announced once via `attendeeJoined` with status "Connected" when prior is still connected', () => {
						// Setup
						const { verifyAttendees } = sendAttendeeSignals([rejoinAttendeeSignal]);

						// Verify
						verifyAttendees(
							[rejoinAttendeeSignal.clientSessionId],
							[rejoinAttendeeSignal.clientConnectionId],
							[SessionClientStatus.Connected],
						);
					});

					it('first time is announced via `attendeeJoined` with status "Connected" even if unknown to audience', () => {
						// Setup - remove connection from audience
						runtime.removeMember("client4");
						const { verifyAttendees } = sendAttendeeSignals([initialAttedeeSignal]);

						// Verify
						verifyAttendees(
							[initialAttedeeSignal.clientSessionId],
							[initialAttedeeSignal.clientConnectionId],
							[SessionClientStatus.Connected],
						);
					});

					it('second time is announced once via `attendeeJoined` with status "Connected" even if most recent unknown to audience', () => {
						// Setup - remove connection from audience
						runtime.removeMember("client7");

						// Act - simulate join message from client
						const { verifyAttendees } = sendAttendeeSignals([rejoinAttendeeSignal]);

						// Verify
						verifyAttendees(
							[rejoinAttendeeSignal.clientSessionId],
							[rejoinAttendeeSignal.clientConnectionId],
							[SessionClientStatus.Connected],
						);
					});

					it("is announced via `attendeeJoined` when second joining attendee is unknown to audience", () => {
						// SETUP - create attendee signals
						// Signal for second joining attendee
						const secondJoinSignal = {
							fixedTime: clock.now - 40,
							averageLatency: 20,
							clientSessionId: "sessionId-9",
							clientConnectionId: "client9",
							updateProviders: [
								"client2" /* Response will be requested from the first joining attendee */,
							],
						};

						// Response signal broadcasted from first joining attendee in response to the second join signal sent above
						const responseSignal = {
							fixedTime: clock.now - 30,
							averageLatency: 30,
							clientSessionId: initialAttedeeSignal.clientSessionId,
							clientConnectionId: initialAttedeeSignal.clientConnectionId,
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
						// Order is important here: 1st client joins -> 2nd client joins -> 1st client responds to 2nd client joining
						const { verifyAttendees } = sendAttendeeSignals([
							initialAttedeeSignal, // First client joins
							secondJoinSignal, // Second client joins
							responseSignal, // First client responds to second client joining
						]);

						// VERIFY
						verifyAttendees(
							[initialAttedeeSignal.clientSessionId, secondJoinSignal.clientSessionId],
							[initialAttedeeSignal.clientConnectionId, secondJoinSignal.clientConnectionId],
							[SessionClientStatus.Connected, SessionClientStatus.Connected],
						);
					});

					it("as collateral and disconnected is NOT announced via `attendeeJoined`", () => {
						// Setup - remove connections from audience
						const collateralAttendeeConnectionId = "client3";
						runtime.removeMember("client4");
						runtime.removeMember(collateralAttendeeConnectionId);

						// Act - simulate join message from client
						const { verifyAttendees } = sendAttendeeSignals([
							{
								fixedTime: clock.now - 10,
								averageLatency: 40,
								clientSessionId: "sessionId-4",
								clientConnectionId: "client7",
								connectionOrder: 1,
								priorClientToSessionId: {
									"client4": {
										rev: 0,
										timestamp: clock.now - 50,
										value: "sessionId-4",
									},
									[collateralAttendeeConnectionId]: {
										rev: 0,
										timestamp: clock.now - 20,
										value: "collateral-id",
									},
								},
							},
						]);

						// Verify only the rejoining attendee is announced
						verifyAttendees(
							[rejoinAttendeeSignal.clientSessionId],
							[rejoinAttendeeSignal.clientConnectionId],
							[SessionClientStatus.Connected],
						);
					});
				});

				describe("that is already known", () => {
					let knownAttendee: ISessionClient | undefined;
					beforeEach(() => {
						// Setup known attendee
						const { attendees } = sendAttendeeSignals([initialAttedeeSignal]);
						assert(attendees.length === 1, "Only one attendee should be announced");
						knownAttendee = attendees[0];
					});

					it('is NOT announced when "rejoined" with same connection (duplicate signal)', () => {
						// Send duplicate signal
						clock.tick(10);
						const { attendees } = sendAttendeeSignals([initialAttedeeSignal]);

						// Verify
						assert(
							attendees.length === 0,
							"No attendee should be announced for duplicate signal",
						);
					});

					// To retain symmetry across Joined and Disconnected events, do not announce
					// attendeeJoined when the attendee is already connected and we only see
					// a connection id update. This can happen when audience removal is late.
					it('is not announced via `attendeeJoined` when already "Connected"', () => {
						// Setup
						clock.tick(10);
						const { attendees } = sendAttendeeSignals([
							{ ...rejoinAttendeeSignal, fixedTime: clock.now - 40 },
						]);

						// Verify
						assert(
							attendees.length === 0,
							"No attendee should be announced when known attendee is already connected",
						);
					});

					for (const [status, setup] of [
						[SessionClientStatus.Connected, () => {}] as const,
						[SessionClientStatus.Disconnected, () => runtime.removeMember("client4")] as const,
					]) {
						for (const [desc, id] of [
							["connection id", "client4"] as const,
							["session id", "sessionId-4"] as const,
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
							runtime.removeMember("client4");

							// Verify
							assert(
								disconnectedAttendee !== undefined,
								"No attendee was disconnected during `removeMember`",
							);
							assert.equal(
								disconnectedAttendee.sessionId,
								knownAttendee.sessionId,
								"Disconnected attendee has wrong session id",
							);
							assert.equal(
								disconnectedAttendee.getConnectionId(),
								"client4",
								"Disconnected attendee has wrong client connection id",
							);
							assert.equal(
								disconnectedAttendee.getConnectionStatus(),
								SessionClientStatus.Disconnected,
								"Disconnected attendee has wrong status",
							);
						});

						it("updates stale attendees status to 'Disconnected'", () => {
							// Setup
							assert(knownAttendee !== undefined, "No attendee was set in beforeEach");
							assert(knownAttendee.getConnectionStatus() === SessionClientStatus.Connected);

							// Act - remove client connection id
							runtime.removeMember("client2");

							// Verify - stale attendee should still be connected after 15 seconds
							clock.tick(15001);
							assert(knownAttendee.getConnectionStatus() === SessionClientStatus.Connected);

							// Verify - stale attendee should be disconnected after 30 seconds
							clock.tick(15001);
							assert.equal(
								knownAttendee.getConnectionStatus(),
								SessionClientStatus.Disconnected,
								"Stale attendee has wrong status",
							);
						});

						it('is not announced via `attendeeDisconnected` when already "Disconnected"', () => {
							// Setup

							const clientToDisconnect = runtime.audience.getMember("client4");
							assert(clientToDisconnect !== undefined, "No client to disconnect");

							// Remove client connection id
							runtime.removeMember("client4");

							afterCleanUp.push(
								presence.events.on("attendeeDisconnected", (attendee) => {
									assert.fail(
										"`attendeeDisconnected` should not be emitted for already disconnected attendee",
									);
								}),
							);

							// Act & Verify - fake event to remove client connection id again
							runtime.audience.emit("removeMember", "client4", clientToDisconnect);
						});
					});
				});

				describe("that is rejoining", () => {
					let priorAttendee: ISessionClient | undefined;
					beforeEach(() => {
						// Setup known attendee
						const { attendees } = sendAttendeeSignals([initialAttedeeSignal]);
						assert(attendees.length === 1, "Only one attendee should be announced");
						priorAttendee = attendees[0];

						// Disconnect the attendee
						runtime.removeMember("client4");
					});

					it("is NOT announced when rejoined with same connection (duplicate signal)", () => {
						clock.tick(10);
						// Send duplicate signal
						const { attendees } = sendAttendeeSignals([initialAttedeeSignal]);

						// Verify
						assert(
							attendees.length === 0,
							"No attendee should be announced for duplicate signal",
						);
					});

					it("is announced when rejoined with different connection and current information is updated", () => {
						// Setup
						assert(priorAttendee !== undefined, "No attendee was set in beforeEach");

						clock.tick(20);

						const { verifyAttendees } = sendAttendeeSignals([rejoinAttendeeSignal]);

						verifyAttendees(
							[priorAttendee.sessionId],
							[priorAttendee.getConnectionId()],
							[SessionClientStatus.Connected],
						);

						// Attendee is available via new connection id
						const attendeeViaUpdatedId = presence.getAttendee(
							rejoinAttendeeSignal.clientConnectionId,
						);
						assert.equal(
							attendeeViaUpdatedId,
							priorAttendee,
							"getAttendee returned wrong attendee for updated connection id",
						);
						// Attendee is available via old connection id
						const attendeeViaOriginalId = presence.getAttendee(
							initialAttedeeSignal.clientConnectionId,
						);
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
