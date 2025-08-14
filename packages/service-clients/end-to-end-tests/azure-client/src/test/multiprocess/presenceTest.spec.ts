/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { fork, type ChildProcess } from "node:child_process";

import { timeoutPromise } from "@fluidframework/test-utils/internal";

import type {
	MessageFromChild,
	MessageToChild,
	LatestValueUpdatedEvent,
	LatestMapValueUpdatedEvent,
	LatestValueGetResponseEvent,
	LatestMapValueGetResponseEvent,
} from "./messageTypes.js";

/**
 * This test suite is a multi-process end to end test for Fluid using the Presence API on AzureClient.
 * It simulates real-world production scenarios where clients are running on different machines.
 *
 * The pattern demonstrated in this test suite is as follows:
 *
 * This main test file acts as the 'Orchestrator'. The orchestrator's job includes:
 * - Fork child processes to simulate multiple Fluid clients
 * - Send command messages to child clients to perform specific Fluid actions
 * - Receive response messages from child clients to verify expected behavior
 * - Clean up child processes after each test
 *
 * The child processes are located in the `childClient.ts` file. Each child process simulates a Fluid client.
 *
 * The child client's job includes:
 * - Create/Get + connect to Fluid container
 * - Listen for command messages from the orchestrator
 * - Perform the requested action
 * - Send response messages including any relevant data back to the orchestrator to verify expected behavior
 *
 * This test suite tests the following E2E functionality for Presence:
 * - Announce 'attendeeConnected' when remote client joins session
 * - Announce 'attendeeDisconnected' when remote client disconnects
 * - Test Latest state synchronization between clients
 * - Test LatestMap state synchronization between clients
 */
describe(`Presence Multi-Process E2E Tests`, () => {
	const numClients = 3; // Set the total number of Fluid clients to create
	assert(numClients > 1, "Must have at least two clients");

	let children: ChildProcess[] = [];
	// This promise is used to capture all errors that occur in the child processes.
	let childErrorPromise: Promise<void>;
	// Timeout duration used when waiting for response messages from child processes.
	const durationMs = 10_000;
	const afterCleanUp: (() => void)[] = [];

	// Type guards for message types
	function isLatestValueGetResponse(
		msg: MessageFromChild,
	): msg is LatestValueGetResponseEvent {
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

	/**
	 * Helper function to connect all child processes to a container
	 */
	async function connectChildProcesses(
		childProcesses: ChildProcess[],
	): Promise<{ containerId: string; creatorSessionId: string }> {
		let containerIdPromise: Promise<string> | undefined;
		let containerCreatorSessionId: string | undefined;

		for (const [index, child] of childProcesses.entries()) {
			const user = { id: `test-user-id-${index}`, name: `test-user-name-${index}` };
			const message: MessageToChild = { command: "connect", user };

			if (containerIdPromise === undefined) {
				// Create a promise that resolves with the containerId from the created container.
				containerIdPromise = timeoutPromise<string>(
					(resolve, reject) => {
						child.once("message", (msg: MessageFromChild) => {
							if (msg.event === "ready" && msg.containerId) {
								containerCreatorSessionId = msg.attendeeId;
								resolve(msg.containerId);
							} else {
								reject(new Error(`Non-ready message from child0: ${JSON.stringify(msg)}`));
							}
						});
					},
					{
						durationMs,
						errorMsg: "did not receive 'ready' from child process",
					},
				);
			} else {
				// For subsequent children, wait for containerId from the promise only when needed.
				message.containerId = await containerIdPromise;
			}

			child.send(message);
		}

		const containerId = await containerIdPromise;
		assert(containerId, "Container ID should be set");
		assert(containerCreatorSessionId, "Container creator session ID should be set");
		return {
			containerId,
			creatorSessionId: containerCreatorSessionId,
		};
	}

	/**
	 * Helper function to wait for a specific event from a child process
	 */
	async function waitForEvent(
		child: ChildProcess,
		eventType: MessageFromChild["event"],
		predicate?: (msg: MessageFromChild) => boolean,
		errorMsg: string = `did not receive '${eventType}' event`,
	): Promise<MessageFromChild> {
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

	beforeEach("setup", async () => {
		// Collect all child process error promises into this array
		const childErrorPromises: Promise<void>[] = [];

		// Fork child processes
		for (let i = 0; i < numClients; i++) {
			const child = fork("./lib/test/multiprocess/childClient.js", [
				`child${i}` /* identifier passed to child process */,
			]);

			const errorPromise = new Promise<void>((_resolve, reject) => {
				child.on("error", (error) => {
					reject(new Error(`Child${i} process errored: ${error.message}`));
				});
			});

			childErrorPromises.push(errorPromise);
			children.push(child);
			// Register cleanup for the child process listeners.
			afterCleanUp.push(() => child.removeAllListeners());
		}

		// This race will be used to reject any of the following tests on any child process errors
		childErrorPromise = Promise.race(childErrorPromises);
	});

	// After each test, kill each child process and call any cleanup functions that were registered
	afterEach(async () => {
		for (const child of children) {
			child.kill();
		}
		children = [];
		for (const cleanUp of afterCleanUp) {
			cleanUp();
		}
		afterCleanUp.length = 0;
	});

	describe("Attendee Connection/Disconnection", () => {
		it("announces 'attendeeConnected' when remote client joins session and 'attendeeDisconnected' when remote client disconnects", async () => {
			// Setup
			const attendeeConnectedPromise = timeoutPromise(
				(resolve) => {
					let attendeesJoinedEvents = 0;
					children[0].on("message", (msg: MessageFromChild) => {
						if (msg.event === "attendeeConnected") {
							attendeesJoinedEvents++;
							if (attendeesJoinedEvents === numClients - 1) {
								resolve();
							}
						}
					});
				},
				{
					durationMs,
					errorMsg: "did not receive all 'attendeeConnected' events",
				},
			);

			// Act
			const { creatorSessionId } = await connectChildProcesses(children);

			// Verify
			await Promise.race([attendeeConnectedPromise, childErrorPromise]);

			// Setup
			const waitForDisconnected = children
				.filter((_, index) => index !== 0)
				.map(async (child, index) =>
					timeoutPromise(
						(resolve) => {
							child.on("message", (msg: MessageFromChild) => {
								if (
									msg.event === "attendeeDisconnected" &&
									msg.attendeeId === creatorSessionId
								) {
									resolve();
								}
							});
						},
						{
							durationMs,
							errorMsg: `Attendee[${index}] Disconnected Timeout`,
						},
					),
				);

			// Act
			children[0].send({ command: "disconnectSelf" });

			// Verify
			await Promise.race([Promise.all(waitForDisconnected), childErrorPromise]);
		});
	});

	describe("Latest State Synchronization", () => {
		it("synchronizes Latest state updates between clients", async () => {
			// Setup
			await connectChildProcesses(children);

			const workspaceId = "testLatestWorkspace";
			const testValue = { message: "Hello from client 0", timestamp: Date.now() };

			const remoteClients = children.filter((_, index) => index !== 0);
			const updateEventPromises: Promise<MessageFromChild>[] = [];

			for (let i = 0; i < remoteClients.length; i++) {
				const child = remoteClients[i];
				const promise = waitForEvent(
					child,
					"latestValueUpdated",
					(msg) => isLatestValueUpdated(msg) && msg.workspaceId === workspaceId,
					`Client ${i + 1} did not receive latest value update`,
				);
				updateEventPromises.push(promise);
			}

			// Act
			children[0].send({
				command: "setLatestValue",
				workspaceId,
				value: testValue,
			});

			// Verify
			const updateEvents = await Promise.race([
				Promise.all(updateEventPromises),
				childErrorPromise,
			]);
			assert(Array.isArray(updateEvents), "Expected array of update events but got error");

			for (const updateEvent of updateEvents) {
				assert(isLatestValueUpdated(updateEvent), "Expected LatestValueUpdated event");
				assert.deepStrictEqual(updateEvent.value, testValue);
			}
		});

		it("allows clients to read Latest state from other clients", async () => {
			// Setup
			const { creatorSessionId } = await connectChildProcesses(children);

			const workspaceId = "testLatestWorkspace";
			const testValue = { message: "Hello from client 0", counter: 42 };
			const remoteClients = children.filter((_, index) => index !== 0);
			const getResponsePromises: Promise<MessageFromChild>[] = [];

			// Act
			children[0].send({
				command: "setLatestValue",
				workspaceId,
				value: testValue,
			});

			await new Promise((resolve) => setTimeout(resolve, 100));

			for (let i = 0; i < remoteClients.length; i++) {
				const child = remoteClients[i];
				const responsePromise = waitForEvent(
					child,
					"latestValueGetResponse",
					(msg) =>
						isLatestValueGetResponse(msg) &&
						msg.workspaceId === workspaceId &&
						msg.attendeeId === creatorSessionId,
					`Client ${i + 1} did not receive latest value response`,
				);

				// Send the request
				child.send({
					command: "getLatestValue",
					workspaceId,
					attendeeId: creatorSessionId,
				});

				getResponsePromises.push(responsePromise);
			}

			// Verify
			const getResponses = await Promise.race([
				Promise.all(getResponsePromises),
				childErrorPromise,
			]);
			assert(Array.isArray(getResponses), "Expected array of response events but got error");
			for (const getResponse of getResponses) {
				assert(isLatestValueGetResponse(getResponse), "Expected LatestValueGetResponse event");
				assert.deepStrictEqual(getResponse.value, testValue);
			}
		});
	});

	describe("LatestMap State Synchronization", () => {
		it("synchronizes LatestMap state updates between clients", async () => {
			// Setup
			await connectChildProcesses(children);

			const workspaceId = "testLatestMapWorkspace";
			const testKey = "player1";
			const testValue = { x: 100, y: 200, color: "red" };
			const remoteClients = children.filter((_, index) => index !== 0);
			const updateEventPromises: Promise<MessageFromChild>[] = [];

			for (let i = 0; i < remoteClients.length; i++) {
				const child = remoteClients[i];
				const promise = waitForEvent(
					child,
					"latestMapValueUpdated",
					(msg) =>
						isLatestMapValueUpdated(msg) &&
						msg.workspaceId === workspaceId &&
						msg.key === testKey,
					`Client ${i + 1} did not receive latest map value update`,
				);
				updateEventPromises.push(promise);
			}

			// Act
			children[0].send({
				command: "setLatestMapValue",
				workspaceId,
				key: testKey,
				value: testValue,
			});

			// Verify
			const updateEvents = await Promise.race([
				Promise.all(updateEventPromises),
				childErrorPromise,
			]);
			assert(Array.isArray(updateEvents), "Expected array of update events but got error");

			// Verify
			for (const updateEvent of updateEvents) {
				assert(isLatestMapValueUpdated(updateEvent), "Expected LatestMapValueUpdated event");
				assert.deepStrictEqual(updateEvent.value, testValue);
			}
		});

		it("allows clients to read LatestMap values from other clients", async () => {
			// Setup
			const { creatorSessionId } = await connectChildProcesses(children);

			const workspaceId = "testLatestMapWorkspace";
			const testKey = "cursor";
			const testValue = { x: 150, y: 300, visible: true };
			const remoteClients = children.filter((_, index) => index !== 0);
			const getResponsePromises: Promise<MessageFromChild>[] = [];

			// Act
			children[0].send({
				command: "setLatestMapValue",
				workspaceId,
				key: testKey,
				value: testValue,
			});

			await new Promise((resolve) => setTimeout(resolve, 100));

			for (let i = 0; i < remoteClients.length; i++) {
				const child = remoteClients[i];
				const responsePromise = waitForEvent(
					child,
					"latestMapValueGetResponse",
					(msg) =>
						isLatestMapValueGetResponse(msg) &&
						msg.workspaceId === workspaceId &&
						msg.key === testKey &&
						msg.attendeeId === creatorSessionId,
					`Client ${i + 1} did not receive latest map value response`,
				);

				// Send the request
				child.send({
					command: "getLatestMapValue",
					workspaceId,
					key: testKey,
					attendeeId: creatorSessionId,
				});

				getResponsePromises.push(responsePromise);
			}

			// Verify
			const getResponses = await Promise.race([
				Promise.all(getResponsePromises),
				childErrorPromise,
			]);
			assert(Array.isArray(getResponses), "Expected array of response events but got error");
			for (const getResponse of getResponses) {
				assert(
					isLatestMapValueGetResponse(getResponse),
					"Expected LatestMapValueGetResponse event",
				);
				assert.deepStrictEqual(getResponse.value, testValue);
			}
		});

		it("handles multiple keys in LatestMap independently", async () => {
			// Setup
			await connectChildProcesses(children);

			const workspaceId = "testMultiKeyMap";
			const key1 = "player1";
			const key2 = "player2";
			const value1 = { name: "Alice", score: 100 };
			const value2 = { name: "Bob", score: 200 };

			const allUpdatePromises: Promise<MessageFromChild>[] = [];
			for (let i = 1; i < children.length; i++) {
				const promise = waitForEvent(
					children[i],
					"latestMapValueUpdated",
					(msg) =>
						isLatestMapValueUpdated(msg) &&
						msg.workspaceId === workspaceId &&
						msg.key === key1,
					`Client ${i} did not receive key1 update`,
				);
				allUpdatePromises.push(promise);
			}
			for (let i = 0; i < children.length; i++) {
				if (i === 1) continue; // Skip the sender
				const promise = waitForEvent(
					children[i],
					"latestMapValueUpdated",
					(msg) =>
						isLatestMapValueUpdated(msg) &&
						msg.workspaceId === workspaceId &&
						msg.key === key2,
					`Client ${i} did not receive key2 update`,
				);
				allUpdatePromises.push(promise);
			}
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Act
			children[0].send({
				command: "setLatestMapValue",
				workspaceId,
				key: key1,
				value: value1,
			});

			children[1].send({
				command: "setLatestMapValue",
				workspaceId,
				key: key2,
				value: value2,
			});

			// Verify
			const updateEvents = await Promise.race([
				Promise.all(allUpdatePromises),
				childErrorPromise,
			]);
			assert(Array.isArray(updateEvents), "Expected array of update events but got error");
			const key1Updates = updateEvents.filter(
				(event) => isLatestMapValueUpdated(event) && event.key === key1,
			);
			const key2Updates = updateEvents.filter(
				(event) => isLatestMapValueUpdated(event) && event.key === key2,
			);
			assert.strictEqual(key1Updates.length, 2, "Expected 2 key1 updates");
			assert.strictEqual(key2Updates.length, 2, "Expected 2 key2 updates");
			for (const updateEvent of key1Updates) {
				assert(isLatestMapValueUpdated(updateEvent), "Expected LatestMapValueUpdated event");
				assert.deepStrictEqual(updateEvent.value, value1);
			}
			for (const updateEvent of key2Updates) {
				assert(isLatestMapValueUpdated(updateEvent), "Expected LatestMapValueUpdated event");
				assert.deepStrictEqual(updateEvent.value, value2);
			}
		});
	});
});
