/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import type { SinonFakeTimers } from "sinon";
import { useFakeTimers } from "sinon";

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
				const newAttendeeSessionId = "sessionId-4";
				const initialAttendeeConnectionId = "client4";
				let newAttendee: ISessionClient | undefined;
				let initialAttendeeSignal: ReturnType<typeof generateBasicClientJoin>;

				beforeEach(() => {
					runtime.submitSignal = () => {};
					newAttendee = undefined;
					initialAttendeeSignal = generateBasicClientJoin(clock.now - 50, {
						averageLatency: 50,
						clientSessionId: newAttendeeSessionId,
						clientConnectionId: initialAttendeeConnectionId,
						updateProviders: ["client2"],
					});
				});

				describe("that joined", () => {
					beforeEach(() => {
						afterCleanUp.push(
							presence.events.on("attendeeJoined", (attendee) => {
								assert(newAttendee === undefined, "Only one attendee should be announced");
								newAttendee = attendee;
							}),
						);
					});
					it('is announced via `attendeeJoined`  with status "Connected" when new', () => {
						// Act - simulate join message from client
						presence.processSignal("", initialAttendeeSignal, false);

						// Verify
						assert(newAttendee !== undefined, "No attendee was announced");
						assert.equal(
							newAttendee.sessionId,
							newAttendeeSessionId,
							"Attendee has wrong session id",
						);
						assert.equal(
							newAttendee.getConnectionId(),
							initialAttendeeConnectionId,
							"Attendee has wrong client connection id",
						);
						assert.equal(
							newAttendee.getConnectionStatus(),
							SessionClientStatus.Connected,
							"Attendee connection status is not Connected",
						);
					});

					it("is not announced via attendeeDisconnected when unknown connection is removed", () => {
						// Setup
						presence.events.on("attendeeDisconnected", () => {
							assert.fail("No attendee should be disconnected in beforeEach");
						});

						// Act & Verify - remove unknown connection id
						presence.removeClientConnectionId("unknownConnectionId");
					});

					describe("already known", () => {
						let disconnectedAttendee: ISessionClient | undefined;
						beforeEach(() => {
							disconnectedAttendee = undefined;
							afterCleanUp.push(
								presence.events.on("attendeeDisconnected", (attendee) => {
									assert(
										disconnectedAttendee === undefined,
										"Only one attendee should be disconnected",
									);
									disconnectedAttendee = attendee;
								}),
							);
							// Setup - simulate join message from client
							presence.processSignal("", initialAttendeeSignal, false);
							assert(newAttendee !== undefined, "No attendee was announced in setup");
						});

						for (const [desc, id] of [
							["connection id", initialAttendeeConnectionId] as const,
							["session id", newAttendeeSessionId] as const,
						]) {
							describe(`is available from \`getAttendee\` by ${desc}`, () => {
								it('with status "Connected"', () => {
									// Act
									const attendee = presence.getAttendee(id);
									// Verify
									assert.equal(attendee, newAttendee, "getAttendee returned wrong attendee");
									assert.equal(
										attendee.getConnectionStatus(),
										SessionClientStatus.Connected,
										"getAttendee returned attendee with wrong status",
									);
								});

								it('with status "Disconnected" after disconnect', () => {
									// Act - remove client connection id
									presence.removeClientConnectionId(initialAttendeeConnectionId);
									const attendee = presence.getAttendee(id);

									// Verify
									assert.equal(attendee, newAttendee, "getAttendee returned wrong attendee");
									assert.equal(
										attendee.getConnectionStatus(),
										SessionClientStatus.Disconnected,
										"getAttendee returned attendee with wrong status",
									);
								});
							});
						}

						describe("is available from `getAttendees`", () => {
							it('with status "Connected"', () => {
								// Setup
								assert(newAttendee !== undefined, "No attendee was set in beforeEach");

								// Act
								const attendees = presence.getAttendees();
								assert(
									attendees.has(newAttendee),
									"getAttendees set does not contain attendee",
								);
								assert.equal(
									newAttendee.getConnectionStatus(),
									SessionClientStatus.Connected,
									"getAttendees set contains attendee with wrong status",
								);
							});
							it('with status "Disconnected"', () => {
								// Setup
								assert(newAttendee !== undefined, "No attendee was set in beforeEach");

								// Act - remove client connection id
								presence.removeClientConnectionId(initialAttendeeConnectionId);

								// Verify
								const attendees = presence.getAttendees();
								assert(
									attendees.has(newAttendee),
									"getAttendees set does not contain attendee",
								);
								assert.equal(
									newAttendee.getConnectionStatus(),
									SessionClientStatus.Disconnected,
									"getAttendees set contains attendee with wrong status",
								);
							});
						});

						it("is announced via `attendeeDisconnected` when its connection is removed", () => {
							// Act - remove client connection id
							presence.removeClientConnectionId(initialAttendeeConnectionId);

							// Verify
							assert(
								disconnectedAttendee !== undefined,
								"No attendee was disconnected in beforeEach",
							);
							assert.equal(
								disconnectedAttendee.sessionId,
								newAttendeeSessionId,
								"Disconnected attendee has wrong session id",
							);
							assert.equal(
								disconnectedAttendee.getConnectionId(),
								initialAttendeeConnectionId,
								"Disconnected attendee has wrong client connection id",
							);
							assert.equal(
								disconnectedAttendee.getConnectionStatus(),
								SessionClientStatus.Disconnected,
								"Disconnected attendee has wrong status",
							);
						});
					});
				});

				describe("that rejoined", () => {
					beforeEach(() => {
						afterCleanUp.push(
							presence.events.on("attendeeJoined", (attendee) => {
								newAttendee = attendee;
							}),
						);

						// Setup - simulate join message from client
						presence.processSignal("", initialAttendeeSignal, false);
						assert(newAttendee !== undefined, "No attendee was announced in setup");
					});

					it("is announced when rejoined with different connection and current information is updated", () => {
						// Setup
						assert(newAttendee !== undefined, "No attendee was set in beforeEach");

						const updatedClientConnectionId = "client5";
						clock.tick(20);
						const rejoinedAttendeeSignal = generateBasicClientJoin(clock.now - 20, {
							averageLatency: 20,
							clientSessionId: newAttendeeSessionId, // Same session id
							clientConnectionId: updatedClientConnectionId, // Different connection id
							connectionOrder: 1,
							updateProviders: ["client2"],
						});
						rejoinedAttendeeSignal.content.data["system:presence"].clientToSessionId[
							initialAttendeeConnectionId
						] =
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							initialAttendeeSignal.content.data["system:presence"].clientToSessionId[
								initialAttendeeConnectionId
							]!;

						// Act - simulate new join message from same client (without disconnect)
						presence.processSignal("", rejoinedAttendeeSignal, false);

						// Verify
						// Session id is unchanged
						assert.equal(
							newAttendee.sessionId,
							newAttendeeSessionId,
							"Attendee has wrong session id",
						);
						// Current connection id is updated
						assert(
							newAttendee.getConnectionId() === updatedClientConnectionId,
							"Attendee does not have updated client connection id",
						);
						// Attendee is available via new connection id
						const attendeeViaUpdatedId = presence.getAttendee(updatedClientConnectionId);
						assert.equal(
							attendeeViaUpdatedId,
							newAttendee,
							"getAttendee returned wrong attendee for updated connection id",
						);
						// Attendee is available via old connection id
						const attendeeViaOriginalId = presence.getAttendee(initialAttendeeConnectionId);
						assert.equal(
							attendeeViaOriginalId,
							newAttendee,
							"getAttendee returned wrong attendee for original connection id",
						);
					});
				});
			});
		});
	});
});
