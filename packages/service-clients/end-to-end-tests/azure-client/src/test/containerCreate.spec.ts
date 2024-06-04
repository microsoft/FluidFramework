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
import { ContainerSchema, type IFluidContainer } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map/internal";
import { SharedMap as SharedMapLegacy } from "@fluidframework/map-legacy";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import { timeoutPromise } from "@fluidframework/test-utils/internal";
import { AxiosResponse } from "axios";

import {
	createAzureClient,
	createAzureClientLegacy,
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
			const { container } = await client.createContainer(schema, "2");
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
				({ container: newContainer } = await client.createContainer(schema, "2"));
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

			const resources = client.getContainer(containerId, schema, "2");
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
			const containerAndServicesP = client.getContainer("containerConfig", schema, "2");

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
			await client.createContainer(schema, "2");
			const event = mockLogger.events.find((e) => e.eventName.endsWith("ContainerLoadStats"));
			assert(event !== undefined, "ContainerLoadStats event should exist");
			const featureGates = event.featureGates as string;
			assert(featureGates.length > 0);
		});
	});

	/**
	 * Testing scenarios for creating/loading containers with the legacy (LTS) version of AzureClient.
	 */
	describe(`Container create with legacy version (${testOpts.variant})`, () => {
		const connectTimeoutMs = 10_000;
		const valueSetTimoutMs = 10_000;
		const isEphemeral: boolean = testOpts.options.isEphemeral;
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

		beforeEach("createAzureClients", function () {
			clientCurrent = createAzureClient();
			clientLegacy = createAzureClientLegacy();
			if (isEphemeral) {
				// TODO: Should we skip ephemeral tests for legacy clients?
				this.skip();
			}
		});

		/**
		 * Scenario: test if a legacy AzureClient can get a container made by the current AzureClient.
		 *
		 * Expected behavior: an error should not be thrown nor should a rejected promise
		 * be returned.
		 */
		it(`Legacy AzureClient can get container made by current AzureClient (mode: "1")`, async () => {
			const { container: containerCurrent } = await clientCurrent.createContainer(
				schemaCurrent,
				// Note: Only containers created in compatibility mode "1" may be loaded by legacy client.
				"1",
			);
			const containerId = await containerCurrent.attach();

			if (containerCurrent.connectionState !== ConnectionState.Connected) {
				await timeoutPromise(
					(resolve) => containerCurrent.once("connected", () => resolve()),
					{
						durationMs: connectTimeoutMs,
						errorMsg: "containerCurrent connect() timeout",
					},
				);
			}

			containerCurrent.initialObjects.map1.set("key", "value");

			const resources = clientLegacy.getContainer(containerId, schemaLegacy);
			await assert.doesNotReject(resources, () => true, "container could not be loaded");

			const { container: containerLegacy } = await resources;
			if (containerLegacy.connectionState !== ConnectionState.Connected) {
				await timeoutPromise(
					(resolve) => containerLegacy.once("connected", () => resolve()),
					{
						durationMs: connectTimeoutMs,
						errorMsg: "containerLegacy connect() timeout",
					},
				);
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
		for (const compatibilityMode of ["1", "2"] as const) {
			it(`Current AzureClient (mode: "${compatibilityMode}") can get container made by legacy AzureClient`, async () => {
				const { container: containerLegacy } =
					await clientLegacy.createContainer(schemaLegacy);
				const containerId = await containerLegacy.attach();

				if (containerLegacy.connectionState !== ConnectionState.Connected) {
					await timeoutPromise(
						(resolve) => containerLegacy.once("connected", () => resolve()),
						{
							durationMs: connectTimeoutMs,
							errorMsg: "containerLegacy connect() timeout",
						},
					);
				}

				const valueSetP = timeoutPromise(
					(resolve) => {
						const confirmValueSet = (): void => {
							if (
								(containerLegacy.initialObjects.map1 as SharedMapLegacy).get(
									"key",
								) === "value"
							) {
								containerLegacy.off("saved", confirmValueSet);
								resolve();
							}
						};
						containerLegacy.on("saved", confirmValueSet);
					},
					{
						durationMs: valueSetTimoutMs,
						errorMsg: "valueSet timeout",
					},
				);
				(containerLegacy.initialObjects.map1 as SharedMapLegacy).set("key", "value");

				// Await the value being saved, especially important if we dispose the legacy container.
				await valueSetP;

				if (compatibilityMode === "2") {
					// We don't support interop between legacy containers and "2" mode, dispose the legacy
					// container to avoid this case.
					containerLegacy.dispose();
				}

				const resources = clientCurrent.getContainer(
					containerId,
					schemaCurrent,
					compatibilityMode,
				);
				await assert.doesNotReject(resources, () => true, "container could not be loaded");

				const { container: containerCurrent } = await resources;

				if (containerCurrent.connectionState !== ConnectionState.Connected) {
					await timeoutPromise(
						(resolve) => containerCurrent.once("connected", () => resolve()),
						{
							durationMs: connectTimeoutMs,
							errorMsg: "containerCurrent connect() timeout",
						},
					);
				}

				const result = (await containerCurrent.initialObjects.map1.get("key")) as string;
				assert.strictEqual(result, "value", "Value not found in copied container");
			});
		}
	});
}
