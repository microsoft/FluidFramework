/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "node:assert";

import { AzureClient } from "@fluidframework/azure-client";
import { AttachState } from "@fluidframework/container-definitions";
import { ContainerSchema } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map";
import { timeoutPromise } from "@fluidframework/test-utils";

import { ConfigTypes, IConfigProviderBase, MockLogger } from "@fluidframework/telemetry-utils";
import { createAzureClient } from "./AzureClientFactory";

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

describe("Container create scenarios", () => {
	const connectTimeoutMs = 1000;
	let client: AzureClient;
	let schema: ContainerSchema;

	beforeEach(() => {
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

		await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
			durationMs: connectTimeoutMs,
			errorMsg: "container connect() timeout",
		});

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

		await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
			durationMs: connectTimeoutMs,
			errorMsg: "container connect() timeout",
		});

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

		await timeoutPromise((resolve) => newContainer.once("connected", () => resolve()), {
			durationMs: connectTimeoutMs,
			errorMsg: "container connect() timeout",
		});

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
	 */
	it("cannot load improperly created container (cannot load a non-existent container)", async () => {
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

	beforeEach(() => {
		mockLogger = new MockLogger();
		client = createAzureClient(
			undefined,
			undefined,
			mockLogger,
			configProvider({
				"Fluid.ContainerRuntime.DisableOpReentryCheck": true,
			}),
		);
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
		mockLogger.assertMatchAny([
			{
				featureGates: JSON.stringify({
					disableOpReentryCheck: true,
				}),
			},
		]);
	});
});
