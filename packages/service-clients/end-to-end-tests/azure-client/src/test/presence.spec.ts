/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

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
	type ISessionClient,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/presence/alpha";
import { timeoutPromise } from "@fluidframework/test-utils/internal";

import { createAzureClient } from "./AzureClientFactory.js";
import { configProvider } from "./utils.js";

async function waitForAttendeeEvent(
	event: "attendeeDisconnected" | "attendeeJoined",
	...presences: IPresence[]
): Promise<ISessionClient[]> {
	return Promise.all(
		presences.map(async (presence, index) =>
			timeoutPromise<ISessionClient>(
				(resolve) => presence.events.on(event, (attendee) => resolve(attendee)),
				{
					durationMs: 2000,
					errorMsg: `Attendee[${index}] Timeout`,
				},
			),
		),
	);
}

describe(`Presence with AzureClient`, () => {
	const connectedContainers: IFluidContainer[] = [];
	const connectTimeoutMs = 10_000;
	const user1: AzureUser = {
		id: "test-user-id-1",
		name: "test-user-name-1",
	};
	const user2: AzureUser = {
		id: "test-user-id-2",
		name: "test-user-name-2",
	};
	const user3: AzureUser = {
		id: "test-user-id-3",
		name: "test-user-name-3",
	};

	afterEach(async () => {
		for (const container of connectedContainers) {
			container.disconnect();
			container.dispose();
		}
		connectedContainers.splice(0, connectedContainers.length);
	});

	const getOrCreatePresenceContainer = async (
		id: string | undefined,
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
		connectedContainers.push(container);

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
		// SETUP
		const {
			container: container1,
			presence: presence1,
			containerId,
		} = await getOrCreatePresenceContainer(undefined, user1);
		const { presence: presence2 } = await getOrCreatePresenceContainer(containerId, user2);
		// Wait for attendees to join
		await waitForAttendeeEvent("attendeeJoined", presence1, presence2);
		const { presence: presence3 } = await getOrCreatePresenceContainer(containerId, user3);
		// Wait for attendees to join
		await waitForAttendeeEvent("attendeeJoined", presence1, presence2, presence3);
		// Get attendee we will disconnect
		const disconnectedAttendee = presence1.getMyself();

		// ACT - Disconnect first attendee
		container1.disconnect();

		// VERIFY - Ensure the attendeeDisconnected event is emitted
		const returnedAttendees = await waitForAttendeeEvent(
			"attendeeDisconnected",
			presence2,
			presence3,
		);
		assert.strictEqual(returnedAttendees.length, 2);

		for (const attendee of returnedAttendees) {
			assert.equal(attendee.sessionId, disconnectedAttendee.sessionId, "Session ID mismatch");
			assert.equal(
				attendee.getConnectionId(),
				disconnectedAttendee.getConnectionId(),
				"Connection ID mismatch",
			);
			assert.equal(
				attendee.getConnectionStatus(),
				"Disconnected",
				"Connection status mismatch",
			);
		}
	});
});
