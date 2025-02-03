/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AzureClient, type AzureContainerServices } from "@fluidframework/azure-client";
import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { timeoutPromise } from "@fluidframework/test-utils/internal";
import { AxiosResponse } from "axios";
import { ContainerSchema, type IFluidContainer } from "fluid-framework";
// eslint-disable-next-line import/no-internal-modules -- Need SharedMap to test it
import { SharedMap } from "fluid-framework/legacy";

import {
	createAzureClient,
	createContainerFromPayload,
	getContainerIdFromPayloadResponse,
	ScopeType,
} from "./AzureClientFactory.js";
import * as ephemeralSummaryTrees from "./ephemeralSummaryTrees.js";
import { configProvider, waitForMember, getTestMatrix } from "./utils.js";

const testMatrix = getTestMatrix();
for (const testOpts of testMatrix) {
	describe(`Fluid audience (${testOpts.variant})`, () => {
		const connectTimeoutMs = 10_000;
		let client: AzureClient;
		let schema: ContainerSchema;
		const isEphemeral: boolean = testOpts.options.isEphemeral;

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
				containerId = getContainerIdFromPayloadResponse(containerResponse);
				({ container, services } = await client.getContainer(containerId, schema, "2"));
			} else {
				({ container, services } = await client.createContainer(schema, "2"));
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
				containerId = getContainerIdFromPayloadResponse(containerResponse);
				({ container, services } = await client.getContainer(containerId, schema, "2"));
			} else {
				({ container, services } = await client.createContainer(schema, "2"));
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
			const { services: servicesGet } = await client2.getContainer(containerId, schema, "2");

			/* This is a workaround for a known bug, we should have one member (self) upon container connection */
			const partner = await waitForMember(servicesGet.audience, "test-user-id-2");
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
				containerId = getContainerIdFromPayloadResponse(containerResponse);
				({ container } = await client.getContainer(containerId, schema, "2"));
			} else {
				({ container } = await client.createContainer(schema, "2"));
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
			const { services: servicesGet } = await client2.getContainer(containerId, schema, "2");

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

		/**
		 * Scenario: Find read-only partner member
		 *
		 * Expected behavior: upon resolving container, the read-only partner member should be able
		 * to resolve original member, and the original member should be able to observe the read-only member.
		 */
		it("can find read-only partner member", async function () {
			let containerId: string;
			let container: IFluidContainer;
			let services: AzureContainerServices;
			if (isEphemeral) {
				const containerResponse: AxiosResponse | undefined = await createContainerFromPayload(
					ephemeralSummaryTrees.observeMemberLeaving,
					"test-user-id-1",
					"test-user-name-1",
				);
				containerId = getContainerIdFromPayloadResponse(containerResponse);
				({ container, services } = await client.getContainer(containerId, schema, "2"));
			} else {
				({ container, services } = await client.createContainer(schema, "2"));
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

			const partnerClient = createAzureClient(
				"test-user-id-2",
				"test-user-name-2",
				undefined,
				undefined,
				[ScopeType.DocRead],
			);
			const { container: partnerContainer, services: partnerServices } =
				await partnerClient.getContainer(containerId, schema, "2");

			if (partnerContainer.connectionState !== ConnectionState.Connected) {
				await timeoutPromise(
					(resolve) => partnerContainer.once("connected", () => resolve()),
					{
						durationMs: connectTimeoutMs,
						errorMsg: "container connect() timeout",
					},
				);
			}

			/* This is a workaround for a known bug, we should have one member (self) upon container connection */
			const partnerSelf = await waitForMember(partnerServices.audience, "test-user-id-2");
			assert.notStrictEqual(partnerSelf, undefined, "We should have partner at this point.");

			const originalSelfSeenByPartner = await waitForMember(
				partnerServices.audience,
				"test-user-id-1",
			);
			assert.notStrictEqual(
				originalSelfSeenByPartner,
				undefined,
				"Partner should see original at this point.",
			);
			const partnerMembers = partnerServices.audience.getMembers();
			assert.strictEqual(
				partnerMembers.size,
				2,
				"Partner should see two members at this point.",
			);

			const partnerSelfSeenByOriginal = await waitForMember(
				services.audience,
				"test-user-id-2",
			);
			const originalMembers = services.audience.getMembers();
			assert.notStrictEqual(
				partnerSelfSeenByOriginal,
				undefined,
				"Should see partner at this point.",
			);
			assert.strictEqual(
				originalMembers.size,
				2,
				"Original should see two members at this point.",
			);

			assert.notStrictEqual(
				partnerSelf?.id,
				originalSelf?.id,
				"Self and partner should have different IDs",
			);
			assert.strictEqual(
				partnerSelf?.id,
				partnerSelfSeenByOriginal?.id,
				"Partner and partner-as-seen-by-original should have same IDs",
			);
		});

		/**
		 * Scenario: Read-only Partner should be able to observe changes in audience
		 *
		 * Expected behavior: upon 1 partner leaving, other read-only parther should observe
		 * memberRemoved event and have correct partner count. Upon new read-only partner joining,
		 * the original read-only partner should observe memberAdded event and have correct partner count.
		 */
		it("can observe member leaving and joining in read-only mode", async function () {
			let containerId: string;
			let container: IFluidContainer;
			if (isEphemeral) {
				const containerResponse: AxiosResponse | undefined = await createContainerFromPayload(
					ephemeralSummaryTrees.observeMemberLeaving,
					"test-user-id-1",
					"test-user-name-1",
				);
				containerId = getContainerIdFromPayloadResponse(containerResponse);
				({ container } = await client.getContainer(containerId, schema, "2"));
			} else {
				({ container } = await client.createContainer(schema, "2"));
				containerId = await container.attach();
			}

			if (container.connectionState !== ConnectionState.Connected) {
				await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
					durationMs: connectTimeoutMs,
					errorMsg: "client1 container connect() timeout",
				});
			}

			const partnerClient = createAzureClient(
				"test-user-id-2",
				"test-user-name-2",
				undefined,
				undefined,
				[ScopeType.DocRead],
			);
			const { container: partnerContainer, services: partnerServices } =
				await partnerClient.getContainer(containerId, schema, "2");

			if (partnerContainer.connectionState !== ConnectionState.Connected) {
				await timeoutPromise(
					(resolve) => partnerContainer.once("connected", () => resolve()),
					{
						durationMs: connectTimeoutMs,
						errorMsg: "client2 container connect() timeout",
					},
				);
			}
			/* This is a workaround for a known bug, we should have one member (self) upon container connection */
			const partnerSelf = await waitForMember(partnerServices.audience, "test-user-id-2");
			assert.notStrictEqual(partnerSelf, undefined, "We should have partner at this point.");

			await waitForMember(partnerServices.audience, "test-user-id-1");
			let members = partnerServices.audience.getMembers();
			assert.strictEqual(members.size, 2, "We should have two members at this point.");

			const partnerClientMemberRemoveP = new Promise<void>((resolve) => {
				partnerServices.audience.on("memberRemoved", () => {
					resolve();
				});
			});

			container.disconnect();

			await partnerClientMemberRemoveP;

			members = partnerServices.audience.getMembers();
			assert.strictEqual(members.size, 1, "We should have one member left at this point.");

			const partnerClientMemberAddP = new Promise<void>((resolve) => {
				partnerServices.audience.on("memberAdded", () => {
					resolve();
				});
			});

			const partnerClient2 = createAzureClient(
				"test-user-id-3",
				"test-user-name-3",
				undefined,
				undefined,
				[ScopeType.DocRead],
			);
			const { container: partnerContainer2, services: partnerServices2 } =
				await partnerClient2.getContainer(containerId, schema, "2");

			if (partnerContainer2.connectionState !== ConnectionState.Connected) {
				await timeoutPromise(
					(resolve) => partnerContainer2.once("connected", () => resolve()),
					{
						durationMs: connectTimeoutMs,
						errorMsg: "client3 container connect() timeout",
					},
				);
			}

			/* This is a workaround for a known bug, we should have one member (self) upon container connection */
			const partnerSelf2 = await waitForMember(partnerServices2.audience, "test-user-id-3");
			assert.notStrictEqual(
				partnerSelf2,
				undefined,
				"We should have new read-only partner at this point.",
			);

			await partnerClientMemberAddP;

			members = partnerServices.audience.getMembers();
			assert.strictEqual(members.size, 2, "We should have two members again at this point.");
			assert.strict(
				members.has("test-user-id-3"),
				"Original read-only partner should see new read-only partner.",
			);
		});
	});
}
