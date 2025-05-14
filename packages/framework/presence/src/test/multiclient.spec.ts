/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
// import { AzureClient, type AzureContainerServices } from "@fluidframework/azure-client";
import { ConnectionState } from "@fluidframework/container-loader";
import { ContainerSchema, type IFluidContainer } from "@fluidframework/fluid-static";
import { ScopeType } from "@fluidframework/driver-definitions/internal";
import { timeoutPromise } from "@fluidframework/test-utils/internal";
import {
	TinyliciousClient,
	type TinyliciousContainerServices,
	type TinyliciousUser,
} from "@fluidframework/tinylicious-client";
import type { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";

import {
	ExperimentalPresenceManager,
	getPresenceViaDataObject,
	type Attendee,
	type ExperimentalPresenceDO,
	type Presence,
} from "../index.js";
import { createAzureClient } from "./AzureClientFactory.js";

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

async function waitForAttendeeEvent(
	event: "attendeeDisconnected" | "attendeeConnected",
	...presences: Presence[]
): Promise<Attendee[]> {
	return Promise.all(
		presences.map(async (presence, index) =>
			timeoutPromise<Attendee>(
				(resolve) => presence.attendees.events.on(event, (attendee) => resolve(attendee)),
				{
					durationMs: 2000,
					errorMsg: `Attendee[${index}] Timeout`,
				},
			),
		),
	);
}

describe(`Presence with TinyliciousClient`, () => {
	const connectedContainers: IFluidContainer[] = [];
	const connectTimeoutMs = 10_000;
	const user1: TinyliciousUser = {
		id: "test-user-id-1",
		name: "test-user-name-1",
	};
	const user2: TinyliciousUser = {
		id: "test-user-id-2",
		name: "test-user-name-2",
	};
	const user3: TinyliciousUser = {
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
		user: TinyliciousUser,
		config?: ReturnType<typeof configProvider>,
		scopes?: ScopeType[],
	): Promise<{
		container: IFluidContainer;
		presence: Presence;
		services: TinyliciousContainerServices;
		client: TinyliciousClient;
		containerId: string;
	}> => {
		const client = createAzureClient(user.id, user.name, undefined, config, scopes);
		const schema: ContainerSchema = {
			initialObjects: {
				presence: ExperimentalPresenceManager,
			},
		};
		let container: IFluidContainer;
		let services: TinyliciousContainerServices;
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

		const presence = getPresenceViaDataObject(
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
		await waitForAttendeeEvent("attendeeConnected", presence1, presence2);
		const { presence: presence3 } = await getOrCreatePresenceContainer(containerId, user3);
		// Wait for attendees to join
		await waitForAttendeeEvent("attendeeConnected", presence1, presence2, presence3);
		// Get attendee we will disconnect
		const disconnectedAttendee = presence1.attendees.getMyself();

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
			assert.equal(
				attendee.attendeeId,
				disconnectedAttendee.attendeeId,
				"Session ID mismatch",
			);
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
