/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AzureClient, type AzureContainerServices } from "@fluidframework/azure-client";
import { type AzureUser, ScopeType } from "@fluidframework/azure-client/internal";
import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { timeoutPromise } from "@fluidframework/test-utils/internal";
import type { AxiosResponse } from "axios";
import { type ContainerSchema, type IFluidContainer } from "fluid-framework";

import {
	createAzureClient,
	createContainerFromPayload,
	getContainerIdFromPayloadResponse,
} from "./AzureClientFactory.js";
import { SignalerTestDataObject } from "./TestDataObject.js";
import * as ephemeralSummaryTrees from "./ephemeralSummaryTrees.js";
import { configProvider, getTestMatrix } from "./utils.js";

async function createSignalListenerPromise<T>(
	signaler: SignalerTestDataObject,
	signalType: string,
	expectedPayload: T,
	name: string = "Signal",
	timeoutMs: number = 10_000,
): Promise<T> {
	return timeoutPromise(
		(resolve, reject) => {
			signaler.onSignal<T>(signalType, (clientId, local, receivedPayload) => {
				try {
					assert.deepStrictEqual(
						receivedPayload,
						expectedPayload,
						"Received payload does not match expected payload",
					);
				} catch (error) {
					return reject(error);
				}
				resolve(receivedPayload);
			});
		},
		{ durationMs: timeoutMs, errorMsg: `${name}: listener timeout` },
	);
}

const testMatrix = getTestMatrix();
for (const testOpts of testMatrix) {
	describe(`Fluid Signals (${testOpts.variant})`, () => {
		const connectedContainers: IFluidContainer[] = [];
		const connectTimeoutMs = 10_000;
		const isEphemeral: boolean = testOpts.options.isEphemeral;
		const user1: AzureUser = {
			id: "test-user-id-1",
			name: "test-user-name-2",
		};
		const user2: AzureUser = {
			id: "test-user-id-1",
			name: "test-user-name-2",
		};
		const user3: AzureUser = {
			id: "test-user-id-1",
			name: "test-user-name-2",
		};

		afterEach(async () => {
			for (const container of connectedContainers) {
				container.disconnect();
				container.dispose();
			}
			connectedContainers.splice(0, connectedContainers.length);
		});

		const getOrCreateSignalerContainer = async (
			id: string | undefined,
			user: AzureUser,
			config?: ReturnType<typeof configProvider>,
			scopes?: ScopeType[],
		): Promise<{
			container: IFluidContainer;
			signaler: SignalerTestDataObject;
			services: AzureContainerServices;
			client: AzureClient;
			containerId: string;
		}> => {
			const client = createAzureClient(user.id, user.name, undefined, config, scopes);
			const schema: ContainerSchema = {
				initialObjects: {
					signaler: SignalerTestDataObject,
				},
			};
			let container: IFluidContainer;
			let services: AzureContainerServices;
			let containerId: string;
			if (id === undefined) {
				if (isEphemeral) {
					const containerResponse: AxiosResponse | undefined =
						await createContainerFromPayload(
							ephemeralSummaryTrees.sendAndRecieveSignals,
							"test-user-id-1",
							"test-user-name-1",
						);
					containerId = getContainerIdFromPayloadResponse(containerResponse);
					({ container, services } = await client.getContainer(containerId, schema, "2"));
				} else {
					({ container, services } = await client.createContainer(schema, "2"));
					containerId = await container.attach();
				}
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

			const signaler = container.initialObjects.signaler as SignalerTestDataObject;
			return {
				client,
				container,
				signaler,
				services,
				containerId,
			};
		};

		/**
		 * Scenario: Client sends a signal and connected clients receive it.
		 *
		 * Expected behavior: While 2 clients are connected to a container,
		 * a signal sent by 1 client should be recieved by both clients.
		 */
		it("can send and receive signals", async () => {
			const { signaler, containerId } = await getOrCreateSignalerContainer(undefined, user1);
			const { signaler: signaler2 } = await getOrCreateSignalerContainer(
				containerId,
				user2,
				configProvider({
					"Fluid.Container.ForceWriteConnection": true,
				}),
			);

			const signalName = "test-signal";
			const signalPayload = { test: "payload" };

			const listenerPromises = [
				createSignalListenerPromise(
					signaler2,
					signalName,
					signalPayload,
					"Write client listening for write client signal",
				),
				createSignalListenerPromise(
					signaler,
					signalName,
					signalPayload,
					"Write client listening for its own signal",
				),
			];

			signaler.submitSignal(signalName, signalPayload);

			await assert.doesNotReject(
				Promise.all(listenerPromises),
				"Listening clients should receive signals.",
			);
		});

		/**
		 * Scenario: Read and Write clients send signals and connected clients receive them.
		 *
		 * Expected behavior: While 2 clients are connected (1 writer, 2 readers) to a container,
		 * a signal sent by any 1 client should be recieved by all 3 clients, regardless of read/write permissions.
		 */
		it("can send and receive read-only client signals", async function () {
			const { signaler: writeSignaler, containerId } = await getOrCreateSignalerContainer(
				undefined,
				user1,
			);
			const { signaler: readSignaler } = await getOrCreateSignalerContainer(
				containerId,
				user2,
				undefined,
				[ScopeType.DocRead],
			);
			const { signaler: readSignaler2 } = await getOrCreateSignalerContainer(
				containerId,
				user3,
				undefined,
				[ScopeType.DocRead],
			);

			const signalName = "test-signal";

			const signalPayload1 = { test: "payload" };
			const listenerPromises1 = [
				createSignalListenerPromise(
					writeSignaler,
					signalName,
					signalPayload1,
					"Write client listening for read client signal",
				),
				createSignalListenerPromise(
					readSignaler2,
					signalName,
					signalPayload1,
					"Read client 2 listening for read client signal",
				),
				createSignalListenerPromise(
					readSignaler,
					signalName,
					signalPayload1,
					"Read client listening for its own signal",
				),
			];
			readSignaler.submitSignal(signalName, signalPayload1);
			await assert.doesNotReject(
				Promise.all(listenerPromises1),
				"Listening clients should receive signals from read clients.",
			);

			const signalPayload2 = { test: "payload2" };
			const listenerPromises2 = [
				createSignalListenerPromise(
					readSignaler,
					signalName,
					signalPayload2,
					"Read client listening for write client signal",
				),
				createSignalListenerPromise(
					readSignaler2,
					signalName,
					signalPayload2,
					"Read client 2 listening for write client signal",
				),
				createSignalListenerPromise(
					writeSignaler,
					signalName,
					signalPayload2,
					"Write client listening for its own signal",
				),
			];
			writeSignaler.submitSignal(signalName, signalPayload2);
			await assert.doesNotReject(
				Promise.all(listenerPromises2),
				"Listening clients should receive signals from write clients.",
			);
		});
	});
}
