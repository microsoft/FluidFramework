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
	ExperimentalPresenceManager,
	type ExperimentalPresenceDO,
	type IPresence,
	// type ISessionClient,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/presence/alpha";
import { timeoutPromise } from "@fluidframework/test-utils/internal";

import { createAzureClient } from "../AzureClientFactory.js";
import { configProvider } from "../utils.js";

interface MessageFromChild {
	event: string;
	sessionId: string;
}

interface MessageToChild {
	command: string;
	containerId: string;
	user: AzureUser;
}

describe(`Presence with AzureClient`, () => {
	const numClients = 5;
	let children: ChildProcess[] = [];
	const connectTimeoutMs = 10_000;
	const initialUser: AzureUser = {
		id: "test-user-id-1",
		name: "test-user-name-1",
	};

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

	const createPresenceContainer = async (
		user: AzureUser,
		config?: ReturnType<typeof configProvider>,
		scopes?: ScopeType[],
	): Promise<{
		container: IFluidContainer;
		presence: IPresence;
		services: AzureContainerServices;
		client: AzureClient;
		containerId: string;
	}> => {
		const client = createAzureClient(user.id, user.name, undefined, config, scopes);
		const schema: ContainerSchema = {
			initialObjects: {
				presence: ExperimentalPresenceManager,
			},
		};

		const { container, services } = await client.createContainer(schema, "2");
		const containerId = await container.attach();

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
			"Container is not attached after attach is called",
		);

		const presence = acquirePresenceViaDataObject(
			container.initialObjects.presence as ExperimentalPresenceDO,
		);
		return {
			client,
			container,
			presence,
			services,
			containerId,
		};
	};

	it("announces 'attendeeDisconnected' when remote client disconnects", async () => {
		const attendeesJoined: string[] = [];
		const attendeesDisconnected: string[] = [];

		// Parent proceess creates container
		const { container, presence, containerId } = await createPresenceContainer(initialUser);

		// Fork child processes
		for (let i = 0; i < numClients; i++) {
			const user = { id: `test-user-id-${i}`, name: `test-user-name-${i}` };
			const child = fork("./lib/test/multiprocess/childClient.js");
			children.push(child);

			// Send connect command to child
			const message: MessageToChild = { command: "connect", containerId, user };
			child.send(message);
		}

		// Wait to receive attendeeJoined event on presence from remote attendees
		await timeoutPromise(
			(resolve) => {
				afterCleanUp.push(
					presence.events.on("attendeeJoined", (attendee) => {
						// Only account for remote attendees
						if (attendee !== presence.getMyself()) {
							attendeesJoined.push(attendee.sessionId);
							if (attendeesJoined.length === numClients) {
								resolve();
							}
						}
					}),
				);
			},
			{
				durationMs: connectTimeoutMs,
				errorMsg: "attendeeJoined event timeout",
			},
		);

		assert.strictEqual(
			attendeesJoined.length,
			numClients,
			"Number of joined attendees is wrong",
		);

		container.disconnect();

		// Wait for child processes to receive attendeeDisconnected event
		const waitForDisconnected = children.map(async (child, index) =>
			timeoutPromise(
				(resolve) => {
					const childProcess = child.on("message", (msg: MessageFromChild) => {
						if (msg.event === "attendeeDisconnected") {
							attendeesDisconnected.push(msg.sessionId);
							resolve();
						}
					});

					afterCleanUp.push(() => {
						childProcess.removeAllListeners();
					});
				},
				{
					durationMs: connectTimeoutMs,
					errorMsg: `Attendee[${index}] Timeout`,
				},
			),
		);

		await Promise.all(waitForDisconnected);

		assert.strictEqual(
			attendeesDisconnected.length,
			numClients,
			"attendeesDisconnected.length",
		);
	});
});
