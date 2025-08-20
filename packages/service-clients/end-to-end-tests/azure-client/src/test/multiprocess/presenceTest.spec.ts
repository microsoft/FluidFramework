/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { ChildProcess } from "node:child_process";

// eslint-disable-next-line import/no-internal-modules
import type { AttendeeId } from "@fluidframework/presence/beta";
import { timeoutPromise } from "@fluidframework/test-utils/internal";

import type { MessageFromChild } from "./messageTypes.js";
import {
	forkChildProcesses,
	connectChildProcesses,
	connectAndWaitForAttendees,
	waitForLatestValueUpdates,
	waitForLatestMapValueUpdates,
	getLatestValueResponses,
	getLatestMapValueResponses,
} from "./utils.js";

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
