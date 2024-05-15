/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { AxiosResponse } from "axios";

import { AzureClient } from "@fluidframework/azure-client";
import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import { ContainerSchema, type IFluidContainer } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import { timeoutPromise } from "@fluidframework/test-utils/internal";

import {
	createAzureClient,
	createContainerFromPayload,
	getContainerIdFromPayloadResponse,
} from "./AzureClientFactory.js";
import * as ephemeralSummaryTrees from "./ephemeralSummaryTrees.js";
import { getTestMatrix } from "./utils.js";

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

const testMatrix = getTestMatrix();
for (const testOpts of testMatrix) {
	describe(`Container create scenarios (${testOpts.variant})`, () => {
		const connectTimeoutMs = 10_000;
		let client: AzureClient;
		let schema: ContainerSchema;
		const isEphemeral: boolean = testOpts.options.isEphemeral;

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
		it("Created container is detached", async function () {
			// We currently don't have API surface to create a detached ephemeral container.
			// Instead, ephemeral containers are created indirectly using the test util createContainerFromPayload().
			// Once we add ephemeral container API surface to AzureClient, we can enable this test for ephemeral too.
			if (isEphemeral) {
				this.skip();
			}
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
			let containerId: string;
			let container: IFluidContainer;
			if (isEphemeral) {
				const containerResponse: AxiosResponse | undefined =
					await createContainerFromPayload(
						ephemeralSummaryTrees.canAttachContainer,
						"test-user-id-1",
						"test-user-name-1",
					);
				containerId = getContainerIdFromPayloadResponse(containerResponse);
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
			let containerId: string;
			let container: IFluidContainer;
			if (isEphemeral) {
				const containerResponse: AxiosResponse | undefined =
					await createContainerFromPayload(
						ephemeralSummaryTrees.cannotAttachContainerTwice,
						"test-user-id-1",
						"test-user-name-1",
					);
				containerId = getContainerIdFromPayloadResponse(containerResponse);
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

			assert.strictEqual(typeof containerId, "string", "Attach did not return a string ID");
			assert.strictEqual(
				container.attachState,
				AttachState.Attached,
				"Container is attached after attach is called",
			);
			await assert.rejects(
				container.attach(),
				() => true,
				"Container should not attach twice",
			);
		});

		/**
		 * Scenario: test if Azure Client can get an existing container.
		 *
		 * Expected behavior: an error should not be thrown nor should a rejected promise
		 * be returned.
		 */
		it("can retrieve existing Azure Fluid Relay container successfully", async () => {
			let containerId: string;
			let newContainer: IFluidContainer;
			if (isEphemeral) {
				const containerResponse: AxiosResponse | undefined =
					await createContainerFromPayload(
						ephemeralSummaryTrees.retrieveExistingAFRContainer,
						"test-user-id-1",
						"test-user-name-1",
					);
				containerId = getContainerIdFromPayloadResponse(containerResponse);
			} else {
				({ container: newContainer } = await client.createContainer(schema));
				containerId = await newContainer.attach();

				if (newContainer.connectionState !== ConnectionState.Connected) {
					await timeoutPromise(
						(resolve) => newContainer.once("connected", () => resolve()),
						{
							durationMs: connectTimeoutMs,
							errorMsg: "container connect() timeout",
						},
					);
				}
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

	describe(`Container create with feature flags (${testOpts.variant})`, () => {
		let client: AzureClient;
		let schema: ContainerSchema;
		let mockLogger: MockLogger;
		const isEphemeral: boolean = testOpts.options.isEphemeral;

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
		it("can create containers with feature gates", async function () {
			// Ephemeral containers are currently not created with the AzureClient, and therefore do not
			// have an attached mockLogger which is needed for this test.
			if (isEphemeral) {
				this.skip();
			}
			await client.createContainer(schema);
			const event = mockLogger.events.find((e) => e.eventName.endsWith("ContainerLoadStats"));
			assert(event !== undefined, "ContainerLoadStats event should exist");
			const featureGates = event.featureGates as string;
			assert(featureGates.length > 0);
		});
	});
}
