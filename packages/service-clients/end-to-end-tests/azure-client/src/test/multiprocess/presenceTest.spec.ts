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
	const connectTimeoutMs = 10_000;

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
		for (let i = 0; i < numClients; i++) {
			const user = { id: `test-user-id-${i}`, name: `test-user-name-${i}` };
			//
			const child = fork("./lib/test/multiprocess/childClient.js", [
				`child${i}` /* only used as an identifier for parent process */,
			]);
			children.push(child);
			// Send connect command to child
			const message: MessageToChild = { command: "connect", containerId, user };
			child.send(message);
			// The initial child process will create the container, so we must wait to receive the containerId so future child clients can use it
			if (i === 0) {
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
						durationMs: connectTimeoutMs,
						errorMsg: "did not receive 'ready' from child process",
					},
				);
			}
			afterCleanUp.push(() => child.removeAllListeners());
		}
		for (const child of children) {
			afterCleanUp.push(() => child.removeAllListeners());
		}
	});

	it("announces 'attendeeJoined' when remote client joins session and 'attendeeDisconnected' when remote client disconnects", async () => {
		const waitForJoined = children
			.filter((_, index) => index !== 0)
			.map(async (child, index) =>
				timeoutPromise(
					(resolve) => {
						child.on("message", (msg: MessageFromChild) => {
							if (msg.event === "attendeeJoined") {
								resolve();
							}
						});
					},
					{
						durationMs: connectTimeoutMs,
						errorMsg: `Attendee[${index}] Joined Timeout`,
					},
				),
			);

		await Promise.all(waitForJoined);

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
						durationMs: connectTimeoutMs,
						errorMsg: `Attendee[${index}] Disconnected Timeout`,
					},
				),
			);

		await Promise.all(waitForDisconnected);
	});
});
