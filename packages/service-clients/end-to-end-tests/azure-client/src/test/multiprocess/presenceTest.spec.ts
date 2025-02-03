/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { fork, ChildProcess } from "node:child_process";

import { timeoutPromise } from "@fluidframework/test-utils/internal";

import type { MessageFromChild, MessageToChild } from "./messageTypes.js";

describe(`Presence with AzureClient`, () => {
	const numClients = 5;
	assert(numClients > 1, "Must have at least two clients");
	let children: ChildProcess[] = [];
	const durationMs = 10_000;

	const afterCleanUp: (() => void)[] = [];
	afterEach(async () => {
		// kill all child processes after each test
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

		// Fork child processes
		for (let i = 0; i < numClients; i++) {
			const child = fork("./lib/test/multiprocess/childClient.js", [
				`child${i}` /* identifier passed to child process */,
			]);
			children.push(child);
		}

		// Send connect command to each child process
		for (const [index, child] of children.entries()) {
			const user = { id: `test-user-id-${index}`, name: `test-user-name-${index}` };
			const message: MessageToChild = { command: "connect", containerId, user };
			child.send(message);
			// The initial child process will create the container, so we must wait to receive the containerId so future child clients can use it
			if (index === 0) {
				await timeoutPromise(
					(resolve) => {
						child.once("message", (msg: MessageFromChild) => {
							if (msg.event === "ready") {
								containerId = msg.containerId;
								resolve();
							}
						});
					},
					{
						durationMs,
						errorMsg: "did not receive 'ready' from child process",
					},
				);
			}
			afterCleanUp.push(() => child.removeAllListeners());
		}

		for (const [index, child] of children.entries()) {
			child.on("error", (error) => {
				assert.fail(`Child${index} process errored: ${error.message}`);
			});
		}
	});

	it("announces 'attendeeJoined' when remote client joins session and 'attendeeDisconnected' when remote client disconnects", async () => {
		let attendeesJoined = 0;
		await timeoutPromise(
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

		await Promise.all(waitForDisconnected);
	});
});
