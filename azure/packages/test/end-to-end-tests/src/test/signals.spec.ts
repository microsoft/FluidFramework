/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "node:assert";

import {
	AzureClient,
	ScopeType,
	type AzureContainerServices,
	type AzureUser,
} from "@fluidframework/azure-client";
import { AttachState } from "@fluidframework/container-definitions";
import { type ContainerSchema, type IFluidContainer } from "@fluidframework/fluid-static";
import { Signaler } from "@fluid-experimental/data-objects";
import { timeoutPromise } from "@fluidframework/test-utils";

import { ConnectionState } from "@fluidframework/container-loader";
import { createAzureClient } from "./AzureClientFactory";
import { configProvider } from "./utils";

async function createSignalListenerPromise<T>(
	signaler: Signaler,
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

describe("Fluid Signals", () => {
	const connectTimeoutMs = 10_000;
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

	const getOrCreateSignalerContainer = async (
		id: string | undefined,
		user: AzureUser,
		config?: ReturnType<typeof configProvider>,
		scopes?: ScopeType[],
	): Promise<{
		container: IFluidContainer;
		signaler: Signaler;
		services: AzureContainerServices;
		client: AzureClient;
		containerId: string;
	}> => {
		const client = createAzureClient(user.id, user.name, undefined, config, scopes);
		const schema: ContainerSchema = {
			initialObjects: {
				signaler: Signaler,
			},
		};
		let container: IFluidContainer;
		let services: AzureContainerServices;
		let containerId: string;
		if (id === undefined) {
			({ container, services } = await client.createContainer(schema));
			containerId = await container.attach();
		} else {
			containerId = id;
			({ container, services } = await client.getContainer(containerId, schema));
		}

		if (container.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => container?.once("connected", () => resolve()), {
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

		const signaler = container.initialObjects.signaler as Signaler;
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

		await Promise.all(listenerPromises);
	});

	/**
	 * Scenario: Read and Write clients send signals and connected clients receive them.
	 *
	 * Expected behavior: While 2 clients are connected (1 writer, 2 readers) to a container,
	 * a signal sent by any 1 client should be recieved by all 3 clients, regardless of read/write permissions.
	 */
	it("can send and receive read-only client signals", async function () {
		if (process.env.FLUID_CLIENT !== "azure") {
			// Tinylicious does not support read-only mode
			this.skip();
		}
		const { signaler, containerId } = await getOrCreateSignalerContainer(undefined, user1);
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
				signaler,
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
		await Promise.all(listenerPromises1);

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
				signaler,
				signalName,
				signalPayload1,
				"Write client listening for its own signal",
			),
		];
		signaler.submitSignal(signalName, signalPayload2);
		await Promise.all(listenerPromises2);
	});
});
