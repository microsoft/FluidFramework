/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { fork, type ChildProcess } from "node:child_process";

// eslint-disable-next-line import/no-internal-modules
import type { AttendeeId } from "@fluidframework/presence/beta";
import { timeoutAwait, timeoutPromise } from "@fluidframework/test-utils/internal";

import type { ConnectCommand, MessageFromChild } from "./messageTypes.js";

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
	for (const numClients of numClientsForAttendeeTests.slice(0, 2)) {
		assert(numClients > 1, "Must have at least two clients");

		// Timeout duration used when waiting for response messages from child processes.
		const childConnectTimeoutMs = 1000 * numClients;
		const allConnectedTimeoutMs = 2000;

		it(`announces 'attendeeConnected' when remote client joins session [${numClients} clients]`, async () => {
			// Setup
			const { children, childErrorPromise } = await forkChildProcesses(
				numClients,
				afterCleanUp,
			);

			// Further Setup with Act and Verify
			await connectAndWaitForAttendees(
				children,
				numClients - 1,
				childConnectTimeoutMs,
				allConnectedTimeoutMs,
				childErrorPromise,
			);
		});

		it(`announces 'attendeeDisconnected' when remote client disconnects [${numClients} clients]`, async () => {
			// Setup
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

			// Act - disconnect first child process
			children[0].send({ command: "disconnectSelf" });

			// Verify - wait for all 'attendeeDisconnected' events
			await Promise.race([Promise.all(waitForDisconnected), childErrorPromise]);
		});
	}
});
