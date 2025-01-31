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
import {
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { SharedMap as SharedMap_1dot4 } from "@fluidframework/map-1dot4";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import { timeoutPromise } from "@fluidframework/test-utils/internal";
import { AxiosResponse } from "axios";
import { ContainerSchema, type IFluidContainer } from "fluid-framework";
// eslint-disable-next-line import/no-internal-modules -- Need SharedMap to test it
import { SharedMap } from "fluid-framework/legacy";
import type { SinonSandbox } from "sinon";
import { createSandbox } from "sinon";

import {
	createAzureClient,
	createAzureClientLegacy,
	createContainerFromPayload,
	getContainerIdFromPayloadResponse,
} from "./AzureClientFactory.js";
import * as ephemeralSummaryTrees from "./ephemeralSummaryTrees.js";
import { getTestMatrix, mapWait } from "./utils.js";

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
				const containerResponse: AxiosResponse | undefined = await createContainerFromPayload(
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
				const containerResponse: AxiosResponse | undefined = await createContainerFromPayload(
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
				const containerResponse: AxiosResponse | undefined = await createContainerFromPayload(
					ephemeralSummaryTrees.retrieveExistingAFRContainer,
					"test-user-id-1",
					"test-user-name-1",
				);
				containerId = getContainerIdFromPayloadResponse(containerResponse);
			} else {
				({ container: newContainer } = await client.createContainer(schema, "2"));
				containerId = await newContainer.attach();

				if (newContainer.connectionState !== ConnectionState.Connected) {
					await timeoutPromise((resolve) => newContainer.once("connected", () => resolve()), {
						durationMs: connectTimeoutMs,
						errorMsg: "container connect() timeout",
					});
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
		it("cannot load improperly created container (cannot load a non-existent container)", async () => {
			const consoleErrorFn = console.error;
			console.error = (): void => {};
			const containerAndServicesP = client.getContainer("containerConfig", schema, "2");

			const errorFn = (error: Error): boolean => {
				assert.notStrictEqual(error.message, undefined, "Azure Client error is undefined");
				// AFR gives R11s fetch error, T9s gives 0x8e4
				if (process.env.FLUID_CLIENT === "azure") {
					assert.strict(
						"errorType" in error &&
							error.errorType === "fileNotFoundOrAccessDeniedError" &&
							"statusCode" in error &&
							error.statusCode === 404,
						`Unexpected error: ${error.message}`,
					);
				} else {
					assert.strict(error.message === "0x8e4", `Unexpected error: ${error.message}`);
				}
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
				map1: SharedMap_1dot4,
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
								(containerLegacy.initialObjects.map1 as SharedMap_1dot4).get("key") === "value"
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
				(containerLegacy.initialObjects.map1 as SharedMap_1dot4).set("key", "value");

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

				const result = containerCurrent.initialObjects.map1.get<string>("key");
				assert.strictEqual(result, "value", "Value not found in copied container");
			});
		}
	});

	/**
	 * Testing creating/loading containers between the compatibility modes.
	 */
	describe(`Container create with current version (${testOpts.variant})`, () => {
		const connectTimeoutMs = 10_000;
		const isEphemeral: boolean = testOpts.options.isEphemeral;
		let clientCurrent1: AzureClient;
		let clientCurrent2: AzureClient;
		let clientLegacy: AzureClientLegacy;
		let sandbox: SinonSandbox;

		const schemaCurrent = {
			initialObjects: {
				map1: SharedMap,
			},
		} satisfies ContainerSchema;

		const schemaLegacy = {
			initialObjects: {
				map1: SharedMap_1dot4,
			},
		};

		before(function () {
			sandbox = createSandbox();
		});

		beforeEach("createAzureClients", function () {
			clientCurrent1 = createAzureClient();
			clientCurrent2 = createAzureClient();
			clientLegacy = createAzureClientLegacy();
			if (isEphemeral) {
				this.skip();
			}
		});

		afterEach(function () {
			sandbox.restore();
		});

		/**
		 * Scenario: test if a legacy AzureClient can get a container made by the current AzureClient.
		 *
		 * Expected behavior: an error should not be thrown nor should a rejected promise
		 * be returned.
		 */
		it(`Legacy AzureClient can get container made by current AzureClient (mode: "1")`, async () => {
			const { container: containerCurrent } = await clientCurrent1.createContainer(
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
				await timeoutPromise((resolve) => containerLegacy.once("connected", () => resolve()), {
					durationMs: connectTimeoutMs,
					errorMsg: "containerLegacy connect() timeout",
				});
			}

			const result = (containerLegacy.initialObjects.map1 as SharedMap_1dot4).get<string>(
				"key",
			);
			assert.strictEqual(result, "value", "Value not found in copied container");
		});

		/**
		 * Scenario: test if a current AzureClient in compatibility mode "2" can get a container made by the current AzureClient in mode "1".
		 *
		 * Expected behavior: an error should not be thrown nor should a rejected promise be returned.
		 */
		it(`Current AzureClient (mode: "2") can get container made by current AzureClient (mode: "1")`, async () => {
			const { container: containerCurrent1 } = await clientCurrent1.createContainer(
				schemaCurrent,
				"1",
			);
			const containerId = await containerCurrent1.attach();

			if (containerCurrent1.connectionState !== ConnectionState.Connected) {
				await timeoutPromise(
					(resolve) => containerCurrent1.once("connected", () => resolve()),
					{
						durationMs: connectTimeoutMs,
						errorMsg: "containerCurrent1 connect() timeout",
					},
				);
			}

			containerCurrent1.initialObjects.map1.set("key", "value");

			const resources = clientCurrent2.getContainer(containerId, schemaCurrent, "2");
			await assert.doesNotReject(resources, () => true, "container could not be loaded");

			const { container: containerCurrent2 } = await resources;
			if (containerCurrent2.connectionState !== ConnectionState.Connected) {
				await timeoutPromise(
					(resolve) => containerCurrent2.once("connected", () => resolve()),
					{
						durationMs: connectTimeoutMs,
						errorMsg: "containerCurrent2 connect() timeout",
					},
				);
			}

			const result = containerCurrent2.initialObjects.map1.get<string>("key");
			assert.strictEqual(result, "value", "Value not found in copied container");
		});

		/**
		 * Scenario: test if a current AzureClient in compatibility mode "1" can get a container made by the current AzureClient in mode "2".
		 *
		 * Expected behavior: an error should not be thrown nor should a rejected promise be returned.
		 */
		it(`Current AzureClient (mode: "1") can get container made by current AzureClient (mode: "2")`, async () => {
			const { container: containerCurrent2 } = await clientCurrent2.createContainer(
				schemaCurrent,
				"2",
			);
			const containerId = await containerCurrent2.attach();

			if (containerCurrent2.connectionState !== ConnectionState.Connected) {
				await timeoutPromise(
					(resolve) => containerCurrent2.once("connected", () => resolve()),
					{
						durationMs: connectTimeoutMs,
						errorMsg: "containerCurrent2 connect() timeout",
					},
				);
			}

			containerCurrent2.initialObjects.map1.set("key", "value");

			const resources = clientCurrent1.getContainer(containerId, schemaCurrent, "1");
			await assert.doesNotReject(resources, () => true, "container could not be loaded");

			const { container: containerCurrent1 } = await resources;
			if (containerCurrent1.connectionState !== ConnectionState.Connected) {
				await timeoutPromise(
					(resolve) => containerCurrent1.once("connected", () => resolve()),
					{
						durationMs: connectTimeoutMs,
						errorMsg: "containerCurrent1 connect() timeout",
					},
				);
			}

			const result = containerCurrent1.initialObjects.map1.get<string>("key");
			assert.strictEqual(result, "value", "Value not found in copied container");
		});

		it("op grouping disabled as expected for 1.x clients", async () => {
			const { container: container1 } = await clientCurrent1.createContainer(
				schemaCurrent,
				"1",
			);
			const containerId = await container1.attach();

			if (container1.connectionState !== ConnectionState.Connected) {
				await timeoutPromise((resolve) => container1.once("connected", () => resolve()), {
					durationMs: connectTimeoutMs,
					errorMsg: "container connect() timeout",
				});
			}

			const containerProcessSpy = sandbox.spy(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
				(container1 as any).container,
				"processRemoteMessage",
			);

			// Explicitly force ops sent to be in the same batch
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
			(container1 as any).container._runtime.orderSequentially(() => {
				const map1 = container1.initialObjects.map1;
				map1.set("1", 1);
				map1.set("2", 2);
				map1.set("3", 3);
			});

			const { container: containerLegacy } = await clientLegacy.getContainer(
				containerId,
				schemaLegacy,
			);
			if (containerLegacy.connectionState !== ConnectionState.Connected) {
				await timeoutPromise((resolve) => containerLegacy.once("connected", () => resolve()), {
					durationMs: connectTimeoutMs,
					errorMsg: "containerLegacy connect() timeout",
				});
			}

			const legacyMap = containerLegacy.initialObjects.map1 as SharedMap_1dot4;

			// Verify ops are processed by legacy AzureClient
			assert.strictEqual(legacyMap.get("1"), 1);
			assert.strictEqual(legacyMap.get("2"), 2);
			assert.strictEqual(legacyMap.get("3"), 3);

			// Inspect the incoming ops
			for (const call of containerProcessSpy.getCalls()) {
				const message = call.firstArg as ISequencedDocumentMessage;
				if (
					message.type === MessageType.Operation &&
					(message.contents as { type: string }).type === "groupedBatch"
				) {
					assert.fail("unexpected groupedBatch found");
				}
			}
		});

		for (const compatibilityMode of ["1", "2"] as const) {
			it(`op grouping works as expected (compatibilityMode: ${compatibilityMode})`, async () => {
				const { container: container1 } = await clientCurrent1.createContainer(
					schemaCurrent,
					compatibilityMode,
				);
				const containerId = await container1.attach();

				if (container1.connectionState !== ConnectionState.Connected) {
					await timeoutPromise((resolve) => container1.once("connected", () => resolve()), {
						durationMs: connectTimeoutMs,
						errorMsg: "container connect() timeout",
					});
				}

				const containerProcessSpy = sandbox.spy(
					// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
					(container1 as any).container,
					"processRemoteMessage",
				);

				// Explicitly force ops sent to be in the same batch
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
				(container1 as any).container._runtime.orderSequentially(() => {
					const map1 = container1.initialObjects.map1;
					map1.set("1", 1);
					map1.set("2", 2);
					map1.set("3", 3);
				});

				const { container: container2 } = await clientCurrent1.getContainer(
					containerId,
					schemaCurrent,
					compatibilityMode,
				);
				const map2 = container2.initialObjects.map1;

				// Process ops coming from service
				assert.strictEqual(await mapWait(map2, "1"), 1);
				assert.strictEqual(await mapWait(map2, "2"), 2);
				assert.strictEqual(await mapWait(map2, "3"), 3);

				// Inspect the incoming ops
				let groupedBatchCount = 0;
				for (const call of containerProcessSpy.getCalls()) {
					const message = call.firstArg as ISequencedDocumentMessage;
					if (
						message.type === MessageType.Operation &&
						typeof message.contents === "string" &&
						(JSON.parse(message.contents) as { type?: unknown }).type === "groupedBatch"
					) {
						groupedBatchCount++;
					}
				}

				if (compatibilityMode === "1") {
					assert.strictEqual(
						groupedBatchCount,
						0,
						"expect no op grouping in compatibilityMode 1",
					);
				} else {
					assert.strictEqual(
						groupedBatchCount,
						1,
						"expect op grouping in compatibilityMode 2",
					);
				}
			});
		}
	});
}
