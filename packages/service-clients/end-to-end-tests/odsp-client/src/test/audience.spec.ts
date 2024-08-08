/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import { ContainerSchema } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map/internal";
import { OdspClient } from "@fluidframework/odsp-client/internal";
import { timeoutPromise } from "@fluidframework/test-utils/internal";

import { createOdspClient, getCredentials } from "./OdspClientFactory.js";
import { waitForMember } from "./utils.js";

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

describe("Fluid audience", () => {
	const connectTimeoutMs = 10_000;
	let client: OdspClient;
	let schema: ContainerSchema;
	const [client1Creds, client2Creds] = getCredentials();

	if (client1Creds === undefined || client2Creds === undefined) {
		throw new Error("Couldn't get login credentials");
	}

	beforeEach(() => {
		client = createOdspClient(client1Creds);
		schema = {
			initialObjects: {
				map1: SharedMap,
			},
		};
	});

	/**
	 * Scenario: Find original member/self
	 *
	 * Expected behavior: container should have a single member upon creation.
	 */
	it("can find original member", async () => {
		const { container, services } = await client.createContainer(schema);
		const itemId = await container.attach();

		if (container.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
				durationMs: connectTimeoutMs,
				errorMsg: "container connect() timeout",
			});
		}

		assert.strictEqual(typeof itemId, "string", "Attach did not return a string ID");
		assert.strictEqual(
			container.attachState,
			AttachState.Attached,
			"Container is not attached after attach is called",
		);

		/* This is a workaround for a known bug, we should have one member (self) upon container connection */
		const myself = await waitForMember(services.audience, client1Creds.email);
		assert.notStrictEqual(myself, undefined, "We should have myself at this point.");

		const members = services.audience.getMembers();
		assert.strictEqual(members.size, 1, "We should have only one member at this point.");
	});

	/**
	 * Scenario: Find partner member
	 *
	 * Expected behavior: upon resolving container, the partner member should be able
	 * to resolve original member.
	 *
	 * Note: This test is currently skipped because the web app examples indicate the audience is functioning properly. AB#6425
	 */
	it.skip("can find partner member", async () => {
		const { container, services } = await client.createContainer(schema);
		const itemId = await container.attach();

		if (container.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
				durationMs: connectTimeoutMs,
				errorMsg: "container connect() timeout",
			});
		}

		assert.strictEqual(typeof itemId, "string", "Attach did not return a string ID");
		assert.strictEqual(
			container.attachState,
			AttachState.Attached,
			"Container is not attached after attach is called",
		);

		/* This is a workaround for a known bug, we should have one member (self) upon container connection */
		const originalSelf = await waitForMember(services.audience, client1Creds.email);
		assert.notStrictEqual(originalSelf, undefined, "We should have myself at this point.");

		// pass client2 credentials
		const client2 = createOdspClient(
			client2Creds,
			undefined,
			configProvider({
				"Fluid.Container.ForceWriteConnection": true,
			}),
		);
		const { services: servicesGet } = await client2.getContainer(itemId, schema);

		/* This is a workaround for a known bug, we should have one member (self) upon container connection */
		const partner = await waitForMember(servicesGet.audience, client2Creds.email);
		assert.notStrictEqual(partner, undefined, "We should have partner at this point.");

		const members = servicesGet.audience.getMembers();
		assert.strictEqual(members.size, 2, "We should have two members at this point.");

		assert.notStrictEqual(
			partner?.id,
			originalSelf?.id,
			"Self and partner should have different IDs",
		);
	});

	/**
	 * Scenario: Partner should be able to observe change in audience
	 *
	 * Expected behavior: upon 1 partner leaving, other parther should observe
	 * memberRemoved event and have correct partner count.
	 *
	 * Note: This test is currently skipped because the web app examples indicate the audience is functioning properly. AB#6425
	 */
	it.skip("can observe member leaving", async () => {
		const { container } = await client.createContainer(schema);
		const itemId = await container.attach();

		if (container.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
				durationMs: connectTimeoutMs,
				errorMsg: "container connect() timeout",
			});
		}

		// pass client2 siteUrl and driveId
		const client2 = createOdspClient(
			client2Creds,
			undefined,
			configProvider({
				"Fluid.Container.ForceWriteConnection": true,
			}),
		);
		const { services: servicesGet } = await client2.getContainer(itemId, schema);

		/* This is a workaround for a known bug, we should have one member (self) upon container connection */
		const partner = await waitForMember(servicesGet.audience, client2Creds.email);
		assert.notStrictEqual(partner, undefined, "We should have partner at this point.");

		let members = servicesGet.audience.getMembers();
		assert.strictEqual(members.size, 2, "We should have two members at this point.");

		container.disconnect();

		await new Promise<void>((resolve) => {
			servicesGet.audience.on("memberRemoved", () => {
				resolve();
			});
		});

		members = servicesGet.audience.getMembers();
		assert.strictEqual(members.size, 1, "We should have one member left at this point.");
	});
});
