/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import type { SinonFakeTimers } from "sinon";
import { useFakeTimers } from "sinon";

import type { ISessionClient } from "../presence.js";
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
					afterCleanUp.push(
						presence.events.on("attendeeJoined", (attendee) => {
							assert(newAttendee === undefined, "Only one attendee should be announced");
							newAttendee = attendee;
						}),
					);

					initialAttendeeSignal = generateBasicClientJoin(clock.now - 50, {
						averageLatency: 50,
						clientSessionId: newAttendeeSessionId,
						clientConnectionId: initialAttendeeConnectionId,
						updateProviders: ["client2"],
					});
				});

				it("is announced via `attendeeJoined` when new", () => {
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
						newAttendee.currentConnectionId(),
						initialAttendeeConnectionId,
						"Attendee has wrong client connection id",
					);
				});

				describe("already known", () => {
					beforeEach(() => {
						// Setup - simulate join message from client
						presence.processSignal("", initialAttendeeSignal, false);
						assert(newAttendee !== undefined, "No attendee was announced in setup");
					});

					for (const [desc, id] of [
						["connection id", initialAttendeeConnectionId] as const,
						["session id", newAttendeeSessionId] as const,
					]) {
						it(`is available from \`getAttendee\` by ${desc}`, () => {
							// Act
							const attendee = presence.getAttendee(id);
							// Verify
							assert.equal(attendee, newAttendee, "getAttendee returned wrong attendee");
						});
					}

					it("is available from `getAttendees`", () => {
						// Setup
						assert(newAttendee !== undefined, "No attendee was set in beforeEach");

						// Act
						const attendees = presence.getAttendees();
						assert(attendees.has(newAttendee), "getAttendees set does not contain attendee");
					});

					it("is NOT announced when rejoined with same connection (duplicate signal)", () => {
						clock.tick(10);

						// Act & Verify - simulate duplicate join message from client
						presence.processSignal("", initialAttendeeSignal, false);
					});

					it("is NOT announced when rejoined with different connection and current information is updated", () => {
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
							newAttendee.currentConnectionId() === updatedClientConnectionId,
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
