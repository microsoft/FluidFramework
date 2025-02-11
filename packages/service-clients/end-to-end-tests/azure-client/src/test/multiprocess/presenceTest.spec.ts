/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { fork, ChildProcess } from "node:child_process";

import { timeoutPromise } from "@fluidframework/test-utils/internal";

import type { MessageFromChild, MessageToChild } from "./messageTypes.js";

/**
 * This test suite is a prototype for a multi-process end to end test for Fluid using the new Presence API on AzureClient.
 * In the future we hope to expand and generalize this pattern to broadly test more Fluid features.
 * Currently our E2E tests are limited to running multiple clients on a single process which does not effectively
 * simulate real-world production scenarios where clients are usually running on different machines.
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
 *
 * This particular test suite tests the following E2E functionality for Presence:
 * - Announce 'attendeeJoined' when remote client joins session.
 * - Announce 'attendeeDisconnected' when remote client disconnects.
 */
describe(`Presence with AzureClient`, () => {
	const numClients = 5; // Set the total number of Fluid clients to create
	assert(numClients > 1, "Must have at least two clients");
	let children: ChildProcess[] = [];
	let childErrorPromises: Promise<void>[];
	const durationMs = 10_000;

	const afterCleanUp: (() => void)[] = [];

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

	beforeEach("setup", async () => {
		// Create inital child process
		let containerId: string | undefined;
		childErrorPromises = [];
		// Fork child processes
		for (let i = 0; i < numClients; i++) {
			const child = fork("./lib/test/multiprocess/childClient.js", [
				`child${i}` /* identifier passed to child process */,
			]);
			const childErrorPromise = new Promise<void>((_, reject) => {
				child.on("error", (error) => {
					reject(new Error(`Child${i} process errored: ${error.message}`));
				});
			});
			childErrorPromises.push(childErrorPromise);
			children.push(child);
		}

		// Send connect command to each child process
		for (const [index, child] of children.entries()) {
			const user = { id: `test-user-id-${index}`, name: `test-user-name-${index}` };
			const message: MessageToChild = { command: "connect", containerId, user };
			/**
			 * If this is the first child process (that creates the container), we must wait for the 'ready' message from the child process.
			 * This is because subsequent child processes will need the containerId to connect to the same container.
			 * We await this promise after sending the connect command to the first child process.
			 */
			const postWait =
				index === 0
					? timeoutPromise(
							(resolve, reject) => {
								child.once("message", (msg: MessageFromChild) => {
									if (msg.event === "ready") {
										containerId = msg.containerId;
										resolve();
									} else {
										reject(new Error(`Non-ready message from child0: ${JSON.stringify(msg)}`));
									}
								});
							},
							{
								durationMs,
								errorMsg: "did not receive 'ready' from child process",
							},
						)
					: undefined;

			// Now send the connect command
			child.send(message);

			if (postWait) {
				await postWait;
			}

			// Add removal of child process listeners to after test cleanup
			afterCleanUp.push(() => child.removeAllListeners());
		}
	});

	it("announces 'attendeeJoined' when remote client joins session and 'attendeeDisconnected' when remote client disconnects", async () => {
		let attendeesJoined = 0;
		const attendeeJoinedPromise = timeoutPromise(
			(resolve) => {
				children[0].on("message", (msg: MessageFromChild) => {
					if (msg.event === "attendeeJoined") {
						attendeesJoined++;
						if (attendeesJoined === numClients - 1) {
							resolve();
						}
					}
				});
			},
			{
				durationMs,
				errorMsg: "did not receive all 'attendeeJoined' events",
			},
		);

		await Promise.race([attendeeJoinedPromise, ...childErrorPromises]);

		children[0].send({ command: "disconnectSelf" });
		// Wait for child processes to receive attendeeDisconnected event
		const waitForDisconnected = children
			.filter((_, index) => index !== 0)
			.map(async (child, index) =>
				timeoutPromise(
					(resolve) => {
						child.on("message", (msg: MessageFromChild) => {
							if (msg.event === "attendeeDisconnected") {
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

		await Promise.race([Promise.all(waitForDisconnected), ...childErrorPromises]);
	});
});
