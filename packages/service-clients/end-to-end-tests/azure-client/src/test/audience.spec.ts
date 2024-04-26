/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { AxiosResponse } from "axios";

import { AzureClient, type AzureContainerServices } from "@fluidframework/azure-client";
import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import { ContainerSchema, type IFluidContainer } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map/internal";
import { timeoutPromise } from "@fluidframework/test-utils/internal";

import { createAzureClient, createContainerFromPayload } from "./AzureClientFactory.js";
import { waitForMember } from "./utils.js";
import * as ephemeralSummaryTrees from "./ephemeralSummaryTrees.js";

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

describe("Fluid audience", () => {
	const connectTimeoutMs = 10_000;
	let client: AzureClient;
	let schema: ContainerSchema;
	const isEphemeral: boolean = process.env.azure__fluid__relay__service__ephemeral === "true";

	beforeEach("createAzureClient", () => {
		client = createAzureClient("test-user-id-1", "test-user-name-1");
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
		let containerId: string;
		let container: IFluidContainer;
		let services: AzureContainerServices;
		if (isEphemeral) {
			const containerResponse: AxiosResponse | undefined = await createContainerFromPayload(
				ephemeralSummaryTrees.findOriginalMember,
				"test-user-id-1",
				"test-user-name-1",
			);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			containerId = containerResponse?.data?.id as string;
			({ container, services } = await client.getContainer(containerId, schema));
		} else {
			({ container, services } = await client.createContainer(schema));
			containerId = await container.attach();
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
			"Container is not attached after attach is called",
		);

		/* This is a workaround for a known bug, we should have one member (self) upon container connection */
		const myself = await waitForMember(services.audience, "test-user-id-1");
		assert.notStrictEqual(myself, undefined, "We should have myself at this point.");

		const members = services.audience.getMembers();
		assert.strictEqual(members.size, 1, "We should have only one member at this point.");
	});

	/**
	 * Scenario: Find partner member
	 *
	 * Expected behavior: upon resolving container, the partner member should be able
	 * to resolve original member.
	 */
	it("can find partner member", async () => {
		let containerId: string = "";
		let container: IFluidContainer;
		let services: AzureContainerServices;
		if (isEphemeral) {
			const containerResponse: AxiosResponse | undefined = await createContainerFromPayload(
				ephemeralSummaryTrees.findPartnerMember,
				"test-user-id-1",
				"test-user-name-1",
			);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			containerId = containerResponse?.data?.id as string;
			({ container, services } = await client.getContainer(containerId, schema));
		} else {
			({ container, services } = await client.createContainer(schema));
			containerId = await container.attach();
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
			"Container is not attached after attach is called",
		);

		/* This is a workaround for a known bug, we should have one member (self) upon container connection */
		const originalSelf = await waitForMember(services.audience, "test-user-id-1");
		assert.notStrictEqual(originalSelf, undefined, "We should have myself at this point.");

		const client2 = createAzureClient(
			"test-user-id-2",
			"test-user-name-2",
			undefined,
			configProvider({
				"Fluid.Container.ForceWriteConnection": true,
			}),
		);
		const { services: servicesGet } = await client2.getContainer(containerId, schema);

		/* This is a workaround for a known bug, we should have one member (self) upon container connection */
		const partner = await waitForMember(servicesGet.audience, "test-user-id-2");
		assert.notStrictEqual(partner, undefined, "We should have partner at this point.");

		const members = servicesGet.audience.getMembers();
		assert.strictEqual(members.size, 2, "We should have two members at this point.");

		assert.notStrictEqual(
			partner?.userId,
			originalSelf?.userId,
			"Self and partner should have different IDs",
		);
	});

	/**
	 * Scenario: Partner should be able to observe change in audience
	 *
	 * Expected behavior: upon 1 partner leaving, other parther should observe
	 * memberRemoved event and have correct partner count.
	 */
	it("can observe member leaving", async () => {
		let containerId: string;
		let container: IFluidContainer;
		if (isEphemeral) {
			const containerResponse: AxiosResponse | undefined = await createContainerFromPayload(
				ephemeralSummaryTrees.observeMemberLeaving,
				"test-user-id-1",
				"test-user-name-1",
			);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			containerId = containerResponse?.data?.id as string;
			({ container } = await client.getContainer(containerId, schema));
		} else {
			({ container } = await client.createContainer(schema));
			containerId = await container.attach();
		}

		if (container.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
				durationMs: connectTimeoutMs,
				errorMsg: "container connect() timeout",
			});
		}

		const client2 = createAzureClient(
			"test-user-id-2",
			"test-user-name-2",
			undefined,
			configProvider({
				"Fluid.Container.ForceWriteConnection": true,
			}),
		);
		const { services: servicesGet } = await client2.getContainer(containerId, schema);

		/* This is a workaround for a known bug, we should have one member (self) upon container connection */
		const partner = await waitForMember(servicesGet.audience, "test-user-id-2");
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
