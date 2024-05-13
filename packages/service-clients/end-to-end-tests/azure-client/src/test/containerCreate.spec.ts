/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AzureClient } from "@fluidframework/azure-client";
import { AzureClient as AzureClientLegacy } from "@fluidframework/azure-client-legacy";
import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import { ContainerSchema } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map/internal";
import { SharedMap as SharedMapLegacy } from "@fluidframework/map-legacy";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import { timeoutPromise } from "@fluidframework/test-utils/internal";

import { createAzureClient, createAzureClientLegacy } from "./AzureClientFactory.js";

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

describe("Container create scenarios", () => {
	const connectTimeoutMs = 10_000;
	let client: AzureClient;
	let schema: ContainerSchema;

	beforeEach("createAzureClient", () => {
		client = createAzureClient();
		schema = {
			initialObjects: {
				map1: SharedMap,
			},
		};
	});

	/**
	 * Scenario: test when an Azure Client container is created,
	 * it is initially detached.
	 *
	 * Expected behavior: an error should not be thrown nor should a rejected promise
	 * be returned.
	 */
	it("Created container is detached", async () => {
		const { container } = await client.createContainer(schema);
		assert.strictEqual(
			container.attachState,
			AttachState.Detached,
			"Container should be detached",
		);

		// Make sure we can attach.
		const containerId = await container.attach();
		assert.strictEqual(typeof containerId, "string", "Attach did not return a string ID");
	});

	/**
	 * Scenario: Test attaching a container.
	 *
	 * Expected behavior: an error should not be thrown nor should a rejected promise
	 * be returned.
	 */
	it("can attach a container", async () => {
		const { container } = await client.createContainer(schema);
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
	});

	/**
	 * Scenario: Test if attaching a container twice fails.
	 *
	 * Expected behavior: an error should not be thrown nor should a rejected promise
	 * be returned.
	 */
	it("cannot attach a container twice", async () => {
		const { container } = await client.createContainer(schema);
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
			"Container is attached after attach is called",
		);
		await assert.rejects(container.attach(), () => true, "Container should not attach twice");
	});

	/**
	 * Scenario: test if Azure Client can get an existing container.
	 *
	 * Expected behavior: an error should not be thrown nor should a rejected promise
	 * be returned.
	 */
	it("can retrieve existing Azure Fluid Relay container successfully", async () => {
		const { container: newContainer } = await client.createContainer(schema);
		const containerId = await newContainer.attach();

		if (newContainer.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => newContainer.once("connected", () => resolve()), {
				durationMs: connectTimeoutMs,
				errorMsg: "container connect() timeout",
			});
		}

		const resources = client.getContainer(containerId, schema);
		await assert.doesNotReject(
			resources,
			() => true,
			"container cannot be retrieved from Azure Fluid Relay",
		);
	});

	/**
	 * Scenario: test if Azure Client can get a non-exiting container.
	 *
	 * Expected behavior: an error should be thrown when trying to get a non-existent container.
	 *
	 * Note: This test is currently skipped because it is failing when ran against tinylicious (azure-local-service).
	 */
	it.skip("cannot load improperly created container (cannot load a non-existent container)", async () => {
		const consoleErrorFn = console.error;
		console.error = (): void => {};
		const containerAndServicesP = client.getContainer("containerConfig", schema);

		const errorFn = (error: Error): boolean => {
			assert.notStrictEqual(error.message, undefined, "Azure Client error is undefined");
			assert.strict(
				error.message.startsWith("R11s fetch error"),
				`Unexpected error: ${error.message}`,
			);
			return true;
		};

		await assert.rejects(
			containerAndServicesP,
			errorFn,
			"Azure Client can load a non-existent container",
		);
		// eslint-disable-next-line require-atomic-updates
		console.error = consoleErrorFn;
	});
});

describe("Container create with feature flags", () => {
	let client: AzureClient;
	let schema: ContainerSchema;
	let mockLogger: MockLogger;

	beforeEach("createAzureClient", () => {
		mockLogger = new MockLogger();
		client = createAzureClient(undefined, undefined, mockLogger, configProvider({}));
		schema = {
			initialObjects: {
				map1: SharedMap,
			},
		};
	});

	/**
	 * Scenario: Test if AzureClient can create a container with feature gates.
	 *
	 * Expected behavior: An error should not be thrown and the logger should have logged the enabled feature gates.
	 */
	it("can create containers with feature gates", async () => {
		await client.createContainer(schema);
		const event = mockLogger.events.find((e) => e.eventName.endsWith("ContainerLoadStats"));
		assert(event !== undefined, "ContainerLoadStats event should exist");
		const featureGates = event.featureGates as string;
		assert(featureGates.length > 0);
	});
});

/**
 * Testing scenarios for creating/loading containers with the legacy (LTS) version of AzureClient.
 */
describe("Container create with legacy version", () => {
	const connectTimeoutMs = 10_000;
	let clientCurrent: AzureClient;
	let clientLegacy: AzureClientLegacy;
	const schemaCurrent = {
		initialObjects: {
			map1: SharedMap,
		},
	} satisfies ContainerSchema;

	const schemaLegacy = {
		initialObjects: {
			map1: SharedMapLegacy,
		},
	};

	beforeEach("createAzureClients", () => {
		clientCurrent = createAzureClient();
		clientLegacy = createAzureClientLegacy();
	});

	/**
	 * Scenario: test if a legacy AzureClient can get a container made by the current AzureClient.
	 *
	 * Expected behavior: an error should not be thrown nor should a rejected promise
	 * be returned.
	 */
	it("Legacy AzureClient can get container made by current AzureClient", async () => {
		const { container: containerCurrent } = await clientCurrent.createContainer(schemaCurrent);
		const containerId = await containerCurrent.attach();

		if (containerCurrent.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => containerCurrent.once("connected", () => resolve()), {
				durationMs: connectTimeoutMs,
				errorMsg: "containerCurrent connect() timeout",
			});
		}

		containerCurrent.initialObjects.map1.set("key", "value");

		const resources = clientLegacy.getContainer(containerId, schemaLegacy);
		await assert.doesNotReject(resources, () => true, "container could not be loaded");

		const { container: containerLegacy } = await resources;
		if (containerLegacy.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => containerLegacy.once("connected", () => resolve()), {
				durationMs: connectTimeoutMs,
				errorMsg: "containerLegacy connect() timeout",
			});
		}

		const result = (await (containerLegacy.initialObjects.map1 as SharedMapLegacy).get(
			"key",
		)) as string;
		assert.strictEqual(result, "value", "Value not found in copied container");
	});

	/**
	 * Scenario: test if a current AzureClient can get a container made by a legacy AzureClient.
	 *
	 * Expected behavior: an error should not be thrown nor should a rejected promise
	 * be returned.
	 */
	it("Current AzureClient can get container made by legacy AzureClient", async () => {
		const { container: containerLegacy } = await clientLegacy.createContainer(schemaLegacy);
		const containerId = await containerLegacy.attach();

		if (containerLegacy.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => containerLegacy.once("connected", () => resolve()), {
				durationMs: connectTimeoutMs,
				errorMsg: "containerLegacy connect() timeout",
			});
		}

		(containerLegacy.initialObjects.map1 as SharedMapLegacy).set("key", "value");

		const resources = clientCurrent.getContainer(containerId, schemaCurrent);
		await assert.doesNotReject(resources, () => true, "container could not be loaded");

		const { container: containerCurrent } = await resources;

		if (containerCurrent.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => containerCurrent.once("connected", () => resolve()), {
				durationMs: connectTimeoutMs,
				errorMsg: "containerCurrent connect() timeout",
			});
		}

		const result = (await containerCurrent.initialObjects.map1.get("key")) as string;
		assert.strictEqual(result, "value", "Value not found in copied container");
	});
});
