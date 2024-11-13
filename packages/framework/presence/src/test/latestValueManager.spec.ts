/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import { type SinonFakeTimers, useFakeTimers } from "sinon";

import { Latest } from "../latestValueManager.js";
import type { LatestValueClientData } from "../latestValueTypes.js";
import type { IPresence } from "../presence.js";
import type { createPresenceManager } from "../presenceManager.js";

import { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";
import {
	prepareConnectedPresence,
	assertFinalExpectations,
	generateBasicClientJoin,
} from "./testUtils.js";

describe("Presence", () => {
	describe("LatestValueManager", () => {
		// Note: this test setup mimics the setup in src/test/presenceManager.spec.ts
		let runtime: MockEphemeralRuntime;
		let logger: EventAndErrorTrackingLogger;
		const initialTime = 1000;
		let clock: SinonFakeTimers;
		let presence: ReturnType<typeof createPresenceManager>;

		before(async () => {
			clock = useFakeTimers();
		});

		beforeEach(() => {
			logger = new EventAndErrorTrackingLogger();
			runtime = new MockEphemeralRuntime(logger);

			// We are configuring the runtime to be in a connected state, so ensure it looks connected
			runtime.connected = true;

			clock.setSystemTime(initialTime);

			// Set up the presence connection
			presence = prepareConnectedPresence(runtime, "sessionId-2", "client2", clock, logger);
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

		describe("batching", () => {
			it("sends signal immediately when allowableUpdateLatency is 0", async () => {
				// Setup
				runtime.signalsExpected.push(
					[
						"Pres:DatastoreUpdate",
						{
							"sendTimestamp": 1010,
							"avgLatency": 10,
							"data": {
								"system:presence": {
									"clientToSessionId": {
										"client2": { "rev": 0, "timestamp": 1000, "value": "sessionId-2" },
									},
								},
								"s:name:testStateWorkspace": {
									"data": {
										"sessionId-2": { "rev": 0, "timestamp": 1010, "value": { "num": 0 } },
									},
								},
							},
						},
					],
					[
						"Pres:DatastoreUpdate",
						{
							"sendTimestamp": 1010,
							"avgLatency": 10,
							"isComplete": true,
							"data": {
								"system:presence": {
									"clientToSessionId": {
										"client2": { "rev": 0, "timestamp": 1000, "value": "sessionId-2" },
									},
								},
								"s:name:testStateWorkspace": {
									"data": {
										"sessionId-2": { "rev": 0, "timestamp": 1010, "value": { "num": 0 } },
									},
								},
							},
						},
					],
					[
						"Pres:DatastoreUpdate",
						{
							"sendTimestamp": 1010,
							"avgLatency": 10,
							"isComplete": true,
							"data": {
								"system:presence": {
									"clientToSessionId": {
										"client2": { "rev": 0, "timestamp": 1000, "value": "sessionId-2" },
									},
								},
								"s:name:testStateWorkspace": {
									"data": {
										"sessionId-2": { "rev": 0, "timestamp": 1010, "value": { "num": 0 } },
									},
								},
							},
						},
					],
					[
						"Pres:DatastoreUpdate",
						{
							"sendTimestamp": 1020,
							"avgLatency": 10,
							"data": {
								"system:presence": {
									"clientToSessionId": {
										"client2": { "rev": 0, "timestamp": 1000, "value": "sessionId-2" },
									},
								},
								"s:name:testStateWorkspace": {
									"data": {
										"sessionId-2": { "rev": 1, "timestamp": 1020, "value": { "num": 42 } },
									},
								},
							},
						},
					],
					[
						"Pres:DatastoreUpdate",
						{
							"sendTimestamp": 1030,
							"avgLatency": 10,
							"data": {
								"system:presence": {
									"clientToSessionId": {
										"client2": { "rev": 0, "timestamp": 1000, "value": "sessionId-2" },
									},
								},
								"s:name:testStateWorkspace": {
									"data": {
										"sessionId-2": { "rev": 2, "timestamp": 1030, "value": { "num": 65 } },
									},
								},
							},
						},
					],
				);

				// Configure a state workspace
				const stateWorkspace = presence.getStates("name:testStateWorkspace", {
					data: Latest({ num: 0 }, { allowableUpdateLatency: 0, forcedRefreshInterval: 0 }),
				});

				const { data } = stateWorkspace.props;

				// Process client join
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

				const joinSignal = generateBasicClientJoin(clock.now - 50, {
					averageLatency: 50,
					clientSessionId: "sessionId-3",
					clientConnectionId: "client3",
					updateProviders: ["client2"],
				});

				presence.processSignal("", joinSignal, false);

				clock.tick(10);
				// This will trigger the third signal
				data.local = { num: 42 };

				clock.tick(10);
				// This will trigger the fourth signal
				data.local = { num: 65 };

				assertFinalExpectations(runtime, logger);
			});

			it("batches signals sent within the allowableUpdateLatency", async () => {
				// Setup
				runtime.signalsExpected.push(
					[
						"Pres:DatastoreUpdate",
						{
							"sendTimestamp": 1010,
							"avgLatency": 10,
							"data": {
								"system:presence": {
									"clientToSessionId": {
										"client2": { "rev": 0, "timestamp": 1000, "value": "sessionId-2" },
									},
								},
								"s:name:testStateWorkspace": {
									"data": {
										"sessionId-2": { "rev": 0, "timestamp": 1010, "value": { "num": 0 } },
									},
								},
							},
						},
					],
					[
						"Pres:DatastoreUpdate",
						{
							"sendTimestamp": 1010,
							"avgLatency": 10,
							"isComplete": true,
							"data": {
								"system:presence": {
									"clientToSessionId": {
										"client2": { "rev": 0, "timestamp": 1000, "value": "sessionId-2" },
									},
								},
								"s:name:testStateWorkspace": {
									"data": {
										"sessionId-2": { "rev": 0, "timestamp": 1010, "value": { "num": 0 } },
									},
								},
							},
						},
					],
					[
						"Pres:DatastoreUpdate",
						{
							"sendTimestamp": 1010,
							"avgLatency": 10,
							"isComplete": true,
							"data": {
								"system:presence": {
									"clientToSessionId": {
										"client2": { "rev": 0, "timestamp": 1000, "value": "sessionId-2" },
									},
								},
								"s:name:testStateWorkspace": {
									"data": {
										"sessionId-2": { "rev": 0, "timestamp": 1010, "value": { "num": 0 } },
									},
								},
							},
						},
					],
					[
						"Pres:DatastoreUpdate",
						{
							"sendTimestamp": 1030,
							"avgLatency": 10,
							"data": {
								"system:presence": {
									"clientToSessionId": {
										"client2": { "rev": 0, "timestamp": 1000, "value": "sessionId-2" },
									},
								},
								"s:name:testStateWorkspace": {
									"data": {
										"sessionId-2": { "rev": 2, "timestamp": 1030, "value": { "num": 65 } },
									},
								},
							},
						},
					],
				);

				// Configure a state workspace
				const stateWorkspace = presence.getStates("name:testStateWorkspace", {
					data: Latest({ num: 0 }, { allowableUpdateLatency: 100, forcedRefreshInterval: 10 }),
				});

				const { data } = stateWorkspace.props;

				// Process client join
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

				const joinSignal = generateBasicClientJoin(clock.now - 50, {
					averageLatency: 50,
					clientSessionId: "sessionId-3",
					clientConnectionId: "client3",
					updateProviders: ["client2"],
				});

				presence.processSignal("", joinSignal, false);

				clock.tick(10);
				// This will trigger the third signal
				data.local = { num: 42 };

				clock.tick(100);
				// This will trigger the fourth signal
				data.local = { num: 65 };

				assertFinalExpectations(runtime, logger);
			});
		});
	});
});

// ---- test (example) code ----

/**
 * Check that the code compiles.
 */
export function checkCompiles(): void {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const presence = {} as IPresence;
	const statesWorkspace = presence.getStates("name:testStatesWorkspaceWithLatest", {
		cursor: Latest({ x: 0, y: 0 }),
		camera: Latest({ x: 0, y: 0, z: 0 }),
	});
	// Workaround ts(2775): Assertions require every name in the call target to be declared with an explicit type annotation.
	const workspace: typeof statesWorkspace = statesWorkspace;
	const props = workspace.props;

	workspace.add("caret", Latest({ id: "", pos: 0 }));

	const fakeAdd =
		workspace.props.caret.local.pos + props.camera.local.z + props.cursor.local.x;
	console.log(fakeAdd);

	// @ts-expect-error local may be set wholly, but partially it is readonly
	workspace.props.caret.local.pos = 0;

	function logClientValue<
		T /* following extends should not be required: */ extends Record<string, unknown>,
	>({ client, value }: Pick<LatestValueClientData<T>, "client" | "value">): void {
		console.log(client.sessionId, value);
	}

	// Create new cursor state
	const cursor = props.cursor;

	// Update our cursor position
	cursor.local = { x: 1, y: 2 };

	// Listen to others cursor updates
	const cursorUpdatedOff = cursor.events.on("updated", ({ client, value }) =>
		console.log(`client ${client.sessionId}'s cursor is now at (${value.x},${value.y})`),
	);
	cursorUpdatedOff();

	for (const client of cursor.clients()) {
		logClientValue({ client, ...cursor.clientValue(client) });
	}

	// Enumerate all cursor values
	for (const { client, value } of cursor.clientValues()) {
		logClientValue({ client, value });
	}
}
