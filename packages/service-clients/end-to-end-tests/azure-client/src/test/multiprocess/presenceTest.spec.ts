/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { fork, type ChildProcess } from "node:child_process";

// eslint-disable-next-line import/no-internal-modules
import type { AttendeeId } from "@fluidframework/presence/beta";
import { timeoutAwait, timeoutPromise } from "@fluidframework/test-utils/internal";

import type {
	ConnectCommand,
	MessageFromChild,
	LatestValueUpdatedEvent,
	LatestMapValueUpdatedEvent,
	LatestValueGetResponseEvent,
	LatestMapValueGetResponseEvent,
} from "./messageTypes.js";

/**
 * This test suite is a prototype for a multi-process end to end test for Fluid using the new Presence API on AzureClient.
 * In the future we hope to expand and generalize this pattern to broadly test more Fluid features.
 * Other E2E tests are limited to running multiple clients on a single process which does not effectively
 * simulate real-world production scenarios where clients are usually running on different machines. Since
 * the Fluid Framework client is designed to carry most of the work burden, multi-process testing from a
 * single machine is also not representative but does at least work past some limitations of a single
 * Node.js process handling multiple clients.
 *
 * The pattern demonstrated in this test suite is as follows:
 *
 * This main test file acts as the 'Orchestrator'. The orchestrator's job includes:
 * - Fork child processes to simulate multiple Fluid clients
 * - Send command messages to child clients to perform specific Fluid actions.
 * - Receive response messages from child clients to verify expected behavior.
 * - Clean up child processes after each test.
 *
 * The child processes are located in the `childClient.ts` file. Each child process simulates a Fluid client.
 *
 * The child client's job includes:
 * - Create/Get + connect to Fluid container.
 * - Listen for command messages from the orchestrator.
 * - Perform the requested action.
 * - Send response messages including any relevant data back to the orchestrator to verify expected behavior.
 */

/**
 * Fork child processes to simulate multiple Fluid clients.
 *
 * @remarks
 * Individual child processes may be scheduled concurrently on a multi-core CPU
 * and separate processes will never share a port when connected to a service.
 *
 * @param numProcesses - The number of child processes to fork.
 * @param cleanUpAccumulator - An array to accumulate cleanup functions for
 * each child process. This is build per instance to accommodate any errors
 * that might occur before completing all forking.
 *
 * @returns A promise that resolves with an object containing the child
 * processes and a promise that rejects on any child process errors.
 */
async function forkChildProcesses(
	numProcesses: number,
	cleanUpAccumulator: (() => void)[],
): Promise<{
	children: ChildProcess[];
	/**
	 * Will never resolve successfully, it is only used to reject on child process error.
	 */
	childErrorPromise: Promise<void>;
}> {
	const children: ChildProcess[] = [];
	const childReadyPromises: Promise<void>[] = [];
	// Collect all child process error promises into this array
	const childErrorPromises: Promise<void>[] = [];
	// Fork child processes
	for (let i = 0; i < numProcesses; i++) {
		const child = fork("./lib/test/multiprocess/childClient.js", [
			`child${i}` /* identifier passed to child process */,
		]);
		// Register a cleanup function to kill the child process
		cleanUpAccumulator.push(() => {
			child.kill();
			child.removeAllListeners();
		});
		const readyPromise = new Promise<void>((resolve, reject) => {
			child.once("message", (msg: MessageFromChild) => {
				if (msg.event === "ack") {
					resolve();
				} else {
					reject(
						new Error(`Unexpected (non-"ack") message from child${i}: ${JSON.stringify(msg)}`),
					);
				}
			});
		});
		childReadyPromises.push(readyPromise);
		const errorPromise = new Promise<void>((_, reject) => {
			child.on("error", (error) => {
				reject(new Error(`Child${i} process errored: ${error.message}`));
			});
		});
		childErrorPromises.push(errorPromise);

		child.send({ command: "ping" });

		children.push(child);
	}
	// This race will be used to reject any of the following tests on any child process errors
	const childErrorPromise = Promise.race(childErrorPromises);

	// All children are always expected to connect successfully and acknowledge the ping.
	await Promise.race([Promise.all(childReadyPromises), childErrorPromise]);

	return {
		children,
		childErrorPromise,
	};
}

function composeConnectMessage(id: string | number): ConnectCommand {
	return {
		command: "connect",
		user: {
			id: `test-user-id-${id}`,
			name: `test-user-name-${id}`,
		},
	};
}

async function connectChildProcesses(
	childProcesses: ChildProcess[],
	readyTimeoutMs: number,
): Promise<{
	containerCreatorAttendeeId: AttendeeId;
	attendeeIdPromises: Promise<AttendeeId>[];
}> {
	if (childProcesses.length === 0) {
		throw new Error("No child processes provided for connection.");
	}
	const firstChild = childProcesses[0];
	const containerReadyPromise = new Promise<{
		containerCreatorAttendeeId: AttendeeId;
		containerId: string;
	}>((resolve, reject) => {
		firstChild.once("message", (msg: MessageFromChild) => {
			if (msg.event === "connected" && msg.containerId) {
				resolve({
					containerCreatorAttendeeId: msg.attendeeId,
					containerId: msg.containerId,
				});
			} else {
				reject(new Error(`Non-connected message from child0: ${JSON.stringify(msg)}`));
			}
		});
	});
	{
		firstChild.send(composeConnectMessage(0));
	}
	const { containerCreatorAttendeeId, containerId } = await timeoutAwait(
		containerReadyPromise,
		{
			durationMs: readyTimeoutMs,
			errorMsg: "did not receive 'connected' from child process",
		},
	);

	const attendeeIdPromises: Promise<AttendeeId>[] = [];
	for (const [index, child] of childProcesses.entries()) {
		if (index === 0) {
			// The first child process is the container creator, it has already sent the 'connected' message.
			attendeeIdPromises.push(Promise.resolve(containerCreatorAttendeeId));
			continue;
		}
		const message = composeConnectMessage(index);

		// For subsequent children, send containerId but do not wait for a response.
		message.containerId = containerId;

		attendeeIdPromises.push(
			new Promise<AttendeeId>((resolve, reject) => {
				child.once("message", (msg: MessageFromChild) => {
					if (msg.event === "connected") {
						resolve(msg.attendeeId);
					} else if (msg.event === "error") {
						reject(new Error(`Child process error: ${msg.error}`));
					}
				});
			}),
		);

		child.send(message);
	}

	if (containerCreatorAttendeeId === undefined) {
		throw new Error("No container creator session ID received from child processes.");
	}

	return { containerCreatorAttendeeId, attendeeIdPromises };
}

/**
 * Connects the child processes and waits for the specified number of attendees to connect.
 * @remarks
 * This function can be used directly as a test. Comments in the functionality describe the
 * breakdown of test blocks.
 *
 * @param children - Array of child processes to connect.
 * @param attendeeCountRequired - The number of attendees that must connect.
 * @param childConnectTimeoutMs - Timeout duration for child process connections.
 * @param attendeesJoinedTimeoutMs - Timeout duration for required attendees to join.
 * @param earlyExitPromise - Promise that resolves/rejects when the test should early exit.
 */
async function connectAndWaitForAttendees(
	children: ChildProcess[],
	attendeeCountRequired: number,
	childConnectTimeoutMs: number,
	attendeesJoinedTimeoutMs: number,
	earlyExitPromise: Promise<void> = Promise.resolve(),
): Promise<{ containerCreatorAttendeeId: AttendeeId }> {
	// Setup
	const attendeeConnectedPromise = new Promise<void>((resolve) => {
		let attendeesJoinedEvents = 0;
		children[0].on("message", (msg: MessageFromChild) => {
			if (msg.event === "attendeeConnected") {
				attendeesJoinedEvents++;
				if (attendeesJoinedEvents >= attendeeCountRequired) {
					resolve();
				}
			}
		});
	});

	// Act - connect all child processes
	const connectResult = await connectChildProcesses(children, childConnectTimeoutMs);

	Promise.all(connectResult.attendeeIdPromises)
		.then(() => console.log("All attendees connected."))
		.catch((error) => {
			console.error("Error connecting children:", error);
		});

	// Verify - wait for all 'attendeeConnected' events
	await timeoutAwait(Promise.race([attendeeConnectedPromise, earlyExitPromise]), {
		durationMs: attendeesJoinedTimeoutMs,
		errorMsg: "did not receive all 'attendeeConnected' events",
	});

	return connectResult;
}

/**
 * Additional helpers for Latest/LatestMap tests (added on top of main without modifying existing helpers)
 */
function isLatestValueGetResponse(msg: MessageFromChild): msg is LatestValueGetResponseEvent {
	return msg.event === "latestValueGetResponse";
}
function isLatestMapValueGetResponse(
	msg: MessageFromChild,
): msg is LatestMapValueGetResponseEvent {
	return msg.event === "latestMapValueGetResponse";
}
function isLatestValueUpdated(msg: MessageFromChild): msg is LatestValueUpdatedEvent {
	return msg.event === "latestValueUpdated";
}
function isLatestMapValueUpdated(msg: MessageFromChild): msg is LatestMapValueUpdatedEvent {
	return msg.event === "latestMapValueUpdated";
}

async function waitForEvent(
	child: ChildProcess,
	eventType: MessageFromChild["event"],
	predicate?: (msg: MessageFromChild) => boolean,
	options: { durationMs?: number; errorMsg?: string } = {},
): Promise<MessageFromChild> {
	const { durationMs = 10_000, errorMsg = `did not receive '${eventType}' event` } = options;
	return timeoutPromise<MessageFromChild>(
		(resolve) => {
			const handler = (msg: MessageFromChild): void => {
				if (msg.event === eventType && (!predicate || predicate(msg))) {
					child.off("message", handler);
					resolve(msg);
				}
			};
			child.on("message", handler);
		},
		{ durationMs, errorMsg },
	);
}

async function waitForLatestValueUpdates(
	clients: ChildProcess[],
	workspaceId: string,
	childErrorPromise: Promise<void>,
	durationMs = 10_000,
): Promise<LatestValueUpdatedEvent[]> {
	const updatePromises = clients.map(async (child, index) =>
		waitForEvent(
			child,
			"latestValueUpdated",
			(msg) => isLatestValueUpdated(msg) && msg.workspaceId === workspaceId,
			{ durationMs, errorMsg: `Client ${index} did not receive latest value update` },
		),
	);
	const responses = await Promise.race([Promise.all(updatePromises), childErrorPromise]);
	if (!Array.isArray(responses)) {
		throw new TypeError("Expected array of responses");
	}
	const latestValueUpdatedEvents: LatestValueUpdatedEvent[] = [];
	for (const response of responses) {
		if (isLatestValueUpdated(response)) {
			latestValueUpdatedEvents.push(response);
		} else {
			throw new TypeError(`Expected LatestValueUpdated but got ${response.event}`);
		}
	}
	return latestValueUpdatedEvents;
}

async function waitForLatestMapValueUpdates(
	clients: ChildProcess[],
	workspaceId: string,
	key: string,
	childErrorPromise: Promise<void>,
	durationMs = 10_000,
): Promise<LatestMapValueUpdatedEvent[]> {
	const updatePromises = clients.map(async (child, index) =>
		waitForEvent(
			child,
			"latestMapValueUpdated",
			(msg) =>
				isLatestMapValueUpdated(msg) && msg.workspaceId === workspaceId && msg.key === key,
			{ durationMs, errorMsg: `Client ${index} did not receive latest map value update` },
		),
	);
	const responses = await Promise.race([Promise.all(updatePromises), childErrorPromise]);
	if (!Array.isArray(responses)) {
		throw new TypeError("Expected array of responses");
	}
	const latestMapValueUpdatedEvents: LatestMapValueUpdatedEvent[] = [];
	for (const response of responses) {
		if (isLatestMapValueUpdated(response)) {
			latestMapValueUpdatedEvents.push(response);
		} else {
			throw new TypeError(`Expected LatestMapValueUpdated but got ${response.event}`);
		}
	}
	return latestMapValueUpdatedEvents;
}

async function getLatestValueResponses(
	clients: ChildProcess[],
	workspaceId: string,
	childErrorPromise: Promise<void>,
	durationMs = 10_000,
): Promise<LatestValueGetResponseEvent[]> {
	const responsePromises = clients.map(async (child, index) =>
		waitForEvent(
			child,
			"latestValueGetResponse",
			(msg) => isLatestValueGetResponse(msg) && msg.workspaceId === workspaceId,
			{ durationMs, errorMsg: `Client ${index} did not respond with latest value` },
		),
	);
	const responses = await Promise.race([Promise.all(responsePromises), childErrorPromise]);
	if (!Array.isArray(responses)) {
		throw new TypeError("Expected array of responses");
	}
	const latestValueGetResponses: LatestValueGetResponseEvent[] = [];
	for (const response of responses) {
		if (isLatestValueGetResponse(response)) {
			latestValueGetResponses.push(response);
		} else {
			throw new TypeError(`Expected LatestValueGetResponse but got ${response.event}`);
		}
	}
	return latestValueGetResponses;
}

async function getLatestMapValueResponses(
	clients: ChildProcess[],
	workspaceId: string,
	key: string,
	childErrorPromise: Promise<void>,
	durationMs = 10_000,
): Promise<LatestMapValueGetResponseEvent[]> {
	const responsePromises = clients.map(async (child, index) =>
		waitForEvent(
			child,
			"latestMapValueGetResponse",
			(msg) =>
				isLatestMapValueGetResponse(msg) && msg.workspaceId === workspaceId && msg.key === key,
			{ durationMs, errorMsg: `Client ${index} did not respond with latest map value` },
		),
	);
	const responses = await Promise.race([Promise.all(responsePromises), childErrorPromise]);
	if (!Array.isArray(responses)) {
		throw new TypeError("Expected array of responses");
	}
	const latestMapValueGetResponses: LatestMapValueGetResponseEvent[] = [];
	for (const response of responses) {
		if (isLatestMapValueGetResponse(response)) {
			latestMapValueGetResponses.push(response);
		} else {
			throw new TypeError(`Expected LatestMapValueGetResponse but got ${response.event}`);
		}
	}
	return latestMapValueGetResponses;
}

/**
 * This particular test suite tests the following E2E functionality for Presence:
 * - Announce 'attendeeConnected' when remote client joins session.
 * - Announce 'attendeeDisconnected' when remote client disconnects.
 */
describe(`Presence with AzureClient`, () => {
	const afterCleanUp: (() => void)[] = [];

	// After each test, call any cleanup functions that were registered (kill each child process)
	afterEach(async () => {
		for (const cleanUp of afterCleanUp) {
			cleanUp();
		}
		afterCleanUp.length = 0;
	});

	// Note that on slower systems 50+ clients may take too long to join.
	const numClientsForAttendeeTests = [5, 20, 50, 100];
	// TODO: AB#45620: "Presence: perf: update Join pattern for scale" may help, then remove .slice.
	// TODO: 20 clients is too many on ADO pipeline agents and times out waiting for attendees.
	for (const numClients of numClientsForAttendeeTests.slice(0, 1)) {
		describe(`[${numClients} clients]`, () => {
			assert(numClients > 1, "Must have at least two clients");
			const childConnectTimeoutMs = 1000 * numClients;
			const allConnectedTimeoutMs = 2000;
			const durationMs = 10_000;

			it("announces 'attendeeConnected' when remote client joins session", async () => {
				const { children, childErrorPromise } = await forkChildProcesses(
					numClients,
					afterCleanUp,
				);
				await connectAndWaitForAttendees(
					children,
					numClients - 1,
					childConnectTimeoutMs,
					allConnectedTimeoutMs,
					childErrorPromise,
				);
			});

			it("announces 'attendeeDisconnected' when remote client disconnects", async () => {
				const { children, childErrorPromise } = await forkChildProcesses(
					numClients,
					afterCleanUp,
				);

				const connectResult = await connectAndWaitForAttendees(
					children,
					numClients - 1,
					childConnectTimeoutMs,
					allConnectedTimeoutMs,
					childErrorPromise,
				);

				const childDisconnectTimeoutMs = 10_000;
				const waitForDisconnected = children.map(async (child, index) =>
					index === 0
						? Promise.resolve()
						: timeoutPromise(
								(resolve) => {
									child.on("message", (msg: MessageFromChild) => {
										if (
											msg.event === "attendeeDisconnected" &&
											msg.attendeeId === connectResult.containerCreatorAttendeeId
										) {
											console.log(`Child[${index}] saw creator disconnect`);
											resolve();
										}
									});
								},
								{
									durationMs: childDisconnectTimeoutMs,
									errorMsg: `Attendee[${index}] Disconnected Timeout`,
								},
							),
				);

				children[0].send({ command: "disconnectSelf" });
				await Promise.race([Promise.all(waitForDisconnected), childErrorPromise]);
			});

			describe("Latest State Synchronization", () => {
				let children: ChildProcess[];
				let childErrorPromise: Promise<void>;
				let containerCreatorAttendeeId: AttendeeId;
				let remoteClients: ChildProcess[];
				const testValue = "testValue";
				const workspaceId = "testLatestWorkspace";

				beforeEach(async () => {
					({ children, childErrorPromise } = await forkChildProcesses(
						numClients,
						afterCleanUp,
					));
					({ containerCreatorAttendeeId } = await connectChildProcesses(
						children,
						childConnectTimeoutMs,
					));
					remoteClients = children.filter((_, index) => index !== 0);
				});

				it("synchronizes Latest state updates between clients", async () => {
					children[0].send({
						command: "setLatestValue",
						workspaceId,
						value: testValue,
					});

					const updateEvents = await waitForLatestValueUpdates(
						remoteClients,
						workspaceId,
						childErrorPromise,
						durationMs,
					);

					for (const updateEvent of updateEvents) {
						assert.deepStrictEqual(updateEvent.value, testValue);
					}
				});

				it("allows clients to read Latest state from other clients", async () => {
					children[0].send({
						command: "setLatestValue",
						workspaceId,
						value: testValue,
					});

					await waitForLatestValueUpdates(
						remoteClients,
						workspaceId,
						childErrorPromise,
						durationMs,
					);

					for (const child of remoteClients) {
						child.send({
							command: "getLatestValue",
							workspaceId,
							attendeeId: containerCreatorAttendeeId,
						});
					}

					const getResponses = await getLatestValueResponses(
						remoteClients,
						workspaceId,
						childErrorPromise,
						durationMs,
					);
					for (const getResponse of getResponses) {
						assert.deepStrictEqual(getResponse.value, testValue);
					}
				});
			});

			describe("LatestMap State Synchronization", () => {
				let children: ChildProcess[];
				let childErrorPromise: Promise<void>;
				let containerCreatorAttendeeId: AttendeeId;
				let attendeeIdPromises: Promise<AttendeeId>[];
				let remoteClients: ChildProcess[];

				beforeEach(async () => {
					({ children, childErrorPromise } = await forkChildProcesses(
						numClients,
						afterCleanUp,
					));
					({ containerCreatorAttendeeId, attendeeIdPromises } = await connectChildProcesses(
						children,
						childConnectTimeoutMs,
					));
					remoteClients = children.filter((_, index) => index !== 0);
				});

				it("synchronizes LatestMap state updates between clients", async () => {
					const workspaceId = "testLatestMapWorkspace";
					const testKey = "player1";
					const testValue = { x: 100, y: 200, color: "red" };

					children[0].send({
						command: "setLatestMapValue",
						workspaceId,
						key: testKey,
						value: testValue,
					});

					const updateEvents = await waitForLatestMapValueUpdates(
						remoteClients,
						workspaceId,
						testKey,
						childErrorPromise,
						durationMs,
					);

					for (const updateEvent of updateEvents) {
						assert.deepStrictEqual(updateEvent.value, testValue);
					}
				});

				it("allows clients to read LatestMap values from other clients", async () => {
					const workspaceId = "testLatestMapWorkspace";
					const testKey = "cursor";
					const testValue = { x: 150, y: 300 };

					children[0].send({
						command: "setLatestMapValue",
						workspaceId,
						key: testKey,
						value: testValue,
					});

					await waitForLatestMapValueUpdates(
						remoteClients,
						workspaceId,
						testKey,
						childErrorPromise,
						durationMs,
					);

					for (const child of remoteClients) {
						child.send({
							command: "getLatestMapValue",
							workspaceId,
							key: testKey,
							attendeeId: containerCreatorAttendeeId,
						});
					}

					const getResponses = await getLatestMapValueResponses(
						remoteClients,
						workspaceId,
						testKey,
						childErrorPromise,
						durationMs,
					);
					for (const getResponse of getResponses) {
						assert.deepStrictEqual(getResponse.value, testValue);
					}
				});

				it("handles multiple keys in LatestMap independently", async () => {
					const workspaceId = "testMultiKeyMap";
					const key1 = "player1";
					const key2 = "player2";
					const value1 = { name: "Alice", score: 100 };
					const value2 = { name: "Bob", score: 200 };

					children[0].send({
						command: "setLatestMapValue",
						workspaceId,
						key: key1,
						value: value1,
					});

					const key1Recipients = children.filter((_, index) => index !== 0);
					const key1UpdateEvents = await waitForLatestMapValueUpdates(
						key1Recipients,
						workspaceId,
						key1,
						childErrorPromise,
						durationMs,
					);

					children[1].send({
						command: "setLatestMapValue",
						workspaceId,
						key: key2,
						value: value2,
					});

					const key2Recipients = children.filter((_, index) => index !== 1);
					const key2UpdateEvents = await waitForLatestMapValueUpdates(
						key2Recipients,
						workspaceId,
						key2,
						childErrorPromise,
						durationMs,
					);

					for (const updateEvent of key1UpdateEvents) {
						assert.deepStrictEqual(updateEvent.value, value1);
					}
					for (const updateEvent of key2UpdateEvents) {
						assert.deepStrictEqual(updateEvent.value, value2);
					}

					const allAttendeeIds = await Promise.all(attendeeIdPromises);
					const attendee0Id = containerCreatorAttendeeId;
					const attendee1Id = allAttendeeIds[1];

					for (const child of children) {
						child.send({
							command: "getLatestMapValue",
							workspaceId,
							key: key1,
							attendeeId: attendee0Id,
						});
					}
					const key1Responses = await getLatestMapValueResponses(
						children,
						workspaceId,
						key1,
						childErrorPromise,
						durationMs,
					);

					for (const child of children) {
						child.send({
							command: "getLatestMapValue",
							workspaceId,
							key: key2,
							attendeeId: attendee1Id,
						});
					}
					const key2Responses = await getLatestMapValueResponses(
						children,
						workspaceId,
						key2,
						childErrorPromise,
						durationMs,
					);

					assert.strictEqual(
						key1Responses.length,
						numClients,
						"Expected responses from all clients for key1",
					);
					assert.strictEqual(
						key2Responses.length,
						numClients,
						"Expected responses from all clients for key2",
					);

					for (const response of key1Responses) {
						assert.deepStrictEqual(response.value, value1, "Key1 value should match");
					}
					for (const response of key2Responses) {
						assert.deepStrictEqual(response.value, value2, "Key2 value should match");
					}
				});
			});
		});
	}
});
