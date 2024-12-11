/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "node:assert";
import { fork, ChildProcess } from "node:child_process";

import { AzureClient, type AzureContainerServices } from "@fluidframework/azure-client";
import { type AzureUser, ScopeType } from "@fluidframework/azure-client/internal";
import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { ContainerSchema, type IFluidContainer } from "@fluidframework/fluid-static";
import {
	acquirePresenceViaDataObject,
	ExperimentalPresenceDO,
	ExperimentalPresenceManager,
	type IPresence,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/presence/alpha";
import { timeoutPromise } from "@fluidframework/test-utils/internal";

import { createAzureClient } from "./AzureClientFactory.js";
import { configProvider } from "./utils.js";

interface MessageFromChild {
	event: string;
	sessionId?: string;
}
const connectTimeoutMs = 10_000;

async function getOrCreatePresenceContainer(
	id: string | undefined,
	user: AzureUser,
	config?: ReturnType<typeof configProvider>,
	scopes: ScopeType[] = [],
): Promise<{
	client: AzureClient;
	container: IFluidContainer;
	services: AzureContainerServices;
	containerId: string;
	presence: IPresence;
}> {
	const client = createAzureClient(user.id, user.name, undefined, config, scopes);
	const schema: ContainerSchema = {
		initialObjects: {
			presence: ExperimentalPresenceManager,
		},
	};
	let container: IFluidContainer;
	let services: AzureContainerServices;
	let containerId: string;

	if (id === undefined) {
		({ container, services } = await client.createContainer(schema, "2"));
		containerId = await container.attach();
	} else {
		containerId = id;
		({ container, services } = await client.getContainer(containerId, schema, "2"));
	}

	if (container.connectionState !== ConnectionState.Connected) {
		await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
			durationMs: connectTimeoutMs,
			errorMsg: "container connect() timeout",
		});
	}

	assert.strictEqual(typeof containerId, "string", "Attach did not return a string ID");
	assert.strictEqual(
		container.attachState,
		AttachState.Attached,
		"Container not attached after attach",
	);

	const presence = acquirePresenceViaDataObject(
		container.initialObjects.presence as ExperimentalPresenceDO,
	);
	return {
		client,
		container,
		services,
		containerId,
		presence,
	};
}

describe("Presence with AzureClient (Multi-Process, Using Fork)", () => {
	const mainUser: AzureUser = { id: "test-user-id-main", name: "test-user-name-main" };
	const numClients = 3; // Adjust this number for different amounts of child processes

	let container: IFluidContainer;
	let presence: IPresence;
	let containerId: string;
	const children: ChildProcess[] = [];
	let readyCount = 0;
	const attendeesJoined: string[] = [];
	const attendeesDisconnected: string[] = [];

	afterEach(async () => {
		if (container) {
			container.disconnect();
			container.dispose();
		}
		for (const child of children) {
			if (!child.killed) {
				child.kill();
			}
		}
	});

	it("runs presence test with multiple child processes", async function () {
		// this.timeout(20000);

		// Step 1: Parent creates container
		const result = await getOrCreatePresenceContainer(undefined, mainUser);
		container = result.container;
		presence = result.presence;
		containerId = result.containerId;

		// Step 2: Fork child processes
		for (let i = 0; i < numClients; i++) {
			const user = { id: `test-user-id-${i}`, name: `test-user-name-${i}` };
			const child = fork("./childClient.js");
			children.push(child);

			child.on("message", (msg: MessageFromChild) => {
				if (msg.event === "ready") {
					readyCount++;
				} else if (msg.event === "attendeeJoined" && msg.sessionId) {
					attendeesJoined.push(msg.sessionId);
				} else if (msg.event === "attendeeDisconnected" && msg.sessionId) {
					attendeesDisconnected.push(msg.sessionId);
				}
			});

			// Send connect command to child
			child.send({ command: "connect", containerId, user });
		}

		// Step 3: Wait for all children to report ready
		await new Promise<void>((resolve, reject) => {
			const start = Date.now();
			const interval = setInterval(() => {
				if (readyCount === numClients) {
					clearInterval(interval);
					resolve();
				} else if (Date.now() - start > 10000) {
					clearInterval(interval);
					reject(new Error("Timeout waiting for all children to be ready"));
				}
			}, 200);
		});

		// Wait a moment for join events to propagate
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Ensure at least some join events are reported
		assert(attendeesJoined.length > 0, "No join events received by children");

		// Step 4: Disconnect the parent container to trigger "attendeeDisconnected"
		container.disconnect();

		// Wait for disconnect events at children
		await new Promise<void>((resolve, reject) => {
			const start = Date.now();
			const interval = setInterval(() => {
				if (attendeesDisconnected.length >= numClients) {
					clearInterval(interval);
					resolve();
				}
				if (Date.now() - start > 10000) {
					clearInterval(interval);
					reject(new Error("Timeout waiting for children to receive disconnect events"));
				}
			}, 200);
		});

		// Verify that children saw the correct attendee disconnected
		const myAttendee = presence.getMyself();
		const mySessionId = myAttendee.sessionId;
		assert(
			attendeesDisconnected.filter((sessionId) => sessionId === mySessionId).length >=
				numClients,
			"Not all children reported the main attendee disconnected",
		);
	});
});
