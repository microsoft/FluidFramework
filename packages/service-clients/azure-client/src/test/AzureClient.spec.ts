/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import type { IConfigProviderBase } from "@fluidframework/core-interfaces";
import { type ConnectionMode } from "@fluidframework/driver-definitions";
import { ScopeType } from "@fluidframework/driver-definitions/internal";
import { type ContainerSchema, type IFluidContainer } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map/internal";
import type { MonitoringContext } from "@fluidframework/telemetry-utils/internal";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";
import { timeoutPromise } from "@fluidframework/test-utils/internal";
import { SchemaFactory, TreeConfiguration } from "@fluidframework/tree";
import { SharedTree } from "@fluidframework/tree/internal";
import { v4 as uuid } from "uuid";

import { AzureClient } from "../AzureClient.js";
import { type AzureLocalConnectionConfig } from "../interfaces.js";

function createAzureClient(
	props: {
		scopes?: ScopeType[];
		configProvider?: IConfigProviderBase;
	} = {},
): AzureClient {
	const connectionProperties: AzureLocalConnectionConfig = {
		tokenProvider: new InsecureTokenProvider(
			"fooBar",
			{
				id: uuid(),
				name: uuid(),
			},
			props.scopes,
		),
		endpoint: "http://localhost:7070",
		type: "local",
	};
	return new AzureClient({
		connection: connectionProperties,
		configProvider: props.configProvider,
	});
}

const connectionModeOf = (container: IFluidContainer): ConnectionMode =>
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
	(container as any).container.connectionMode as ConnectionMode;

for (const compatibilityMode of ["1", "2"] as const) {
	describe(`AzureClient (compatibilityMode: ${compatibilityMode})`, function () {
		const connectTimeoutMs = 1000;
		let client: AzureClient;
		let schema: ContainerSchema;

		beforeEach("createAzureClient", function () {
			client = createAzureClient();
			schema = {
				initialObjects: {
					map1: SharedMap,
				},
			};
		});

		/**
		 * Scenario: test when Azure Client is instantiated correctly, it can create
		 * a container successfully.
		 *
		 * Expected behavior: an error should not be thrown nor should a rejected promise
		 * be returned.
		 */
		it("can create new Azure Fluid Relay container successfully", async function () {
			const resourcesP = client.createContainer(schema, compatibilityMode);

			await assert.doesNotReject(
				resourcesP,
				() => true,
				"container cannot be created in Azure Fluid Relay",
			);
		});

		/**
		 * Scenario: test when an Azure Client container is created,
		 * it is initially detached.
		 *
		 * Expected behavior: an error should not be thrown nor should a rejected promise
		 * be returned.
		 */
		it("created container is detached", async function () {
			const { container } = await client.createContainer(schema, compatibilityMode);
			assert.strictEqual(
				container.attachState,
				AttachState.Detached,
				"Container should be detached",
			);
		});

		/**
		 * Scenario: Test attaching a container.
		 *
		 * Expected behavior: an error should not be thrown nor should a rejected promise
		 * be returned.
		 */
		it("can attach a container", async function () {
			const { container } = await client.createContainer(schema, compatibilityMode);
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
		it("cannot attach a container twice", async function () {
			const { container } = await client.createContainer(schema, compatibilityMode);
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
		it("can retrieve existing Azure Fluid Relay container successfully", async function () {
			const { container: newContainer } = await client.createContainer(
				schema,
				compatibilityMode,
			);
			const containerId = await newContainer.attach();

			if (newContainer.connectionState !== ConnectionState.Connected) {
				await timeoutPromise((resolve) => newContainer.once("connected", () => resolve()), {
					durationMs: connectTimeoutMs,
					errorMsg: "container connect() timeout",
				});
			}

			const resources = client.getContainer(containerId, schema, compatibilityMode);
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
		it("cannot load improperly created container (cannot load a non-existent container)", async function () {
			const consoleErrorFunction = console.error;
			console.error = (): void => {};
			const containerAndServicesP = client.getContainer(
				"containerConfig",
				schema,
				compatibilityMode,
			);

			const errorFunction = (error: Error): boolean => {
				assert.notStrictEqual(error.message, undefined, "Azure Client error is undefined");
				return true;
			};

			await assert.rejects(
				containerAndServicesP,
				errorFunction,
				"Azure Client can load a non-existent container",
			);
			// eslint-disable-next-line require-atomic-updates
			console.error = consoleErrorFunction;
		});

		/**
		 * Scenario: Test if AzureClient with only read permission starts the container in read mode.
		 * AzureClient will attempt to start the connection in write mode, and since access permissions
		 * does not offer write capabilities, the established connection mode will be `read`.
		 *
		 * Expected behavior: AzureClient should start the container with the connectionMode in `read`.
		 */
		it("can create a container with only read permission in read mode", async function () {
			const readOnlyAzureClient = createAzureClient({ scopes: [ScopeType.DocRead] });

			const { container } = await readOnlyAzureClient.createContainer(
				schema,
				compatibilityMode,
			);
			const containerId = await container.attach();
			await timeoutPromise((resolve) => container.once("connected", resolve), {
				durationMs: 1000,
				errorMsg: "container connect() timeout",
			});
			const { container: containerGet } = await readOnlyAzureClient.getContainer(
				containerId,
				schema,
				compatibilityMode,
			);

			assert.strictEqual(
				connectionModeOf(container),
				"read",
				"Creating a container with only read permission is not in read mode",
			);

			assert.strictEqual(
				connectionModeOf(containerGet),
				"read",
				"Getting a container with only read permission is not in read mode",
			);
		});

		/**
		 * Scenario: Test if AzureClient with read and write permissions starts the container in write mode.
		 * AzureClient will attempt to start the connection in write mode, and since access permissions offer
		 * write capability, the established connection mode will be `write`.
		 *
		 * Expected behavior: AzureClient should start the container with the connectionMode in `write`.
		 */
		it("can create a container with read and write permissions in write mode", async function () {
			const readWriteAzureClient = createAzureClient({
				scopes: [ScopeType.DocRead, ScopeType.DocWrite],
			});

			const { container } = await readWriteAzureClient.createContainer(
				schema,
				compatibilityMode,
			);
			const containerId = await container.attach();
			await timeoutPromise((resolve) => container.once("connected", resolve), {
				durationMs: 1000,
				errorMsg: "container connect() timeout",
			});
			const { container: containerGet } = await readWriteAzureClient.getContainer(
				containerId,
				schema,
				compatibilityMode,
			);

			assert.strictEqual(
				connectionModeOf(container),
				"write",
				"Creating a container with only write permission is not in write mode",
			);

			assert.strictEqual(
				connectionModeOf(containerGet),
				"write",
				"Getting a container with only write permission is not in write mode",
			);
		});

		it("GC is disabled by default, but can be enabled", async function () {
			const { container: container_defaultConfig } = await client.createContainer(
				schema,
				compatibilityMode,
			);
			assert.strictEqual(
				(
					container_defaultConfig as unknown as { container: { mc: MonitoringContext } }
				).container.mc.config.getBoolean("Fluid.GarbageCollection.RunSweep"),
				false,
				"Expected GC to be disabled per configs set in constructor",
			);

			const client_gcEnabled = createAzureClient({
				configProvider: {
					getRawConfig: (name: string) =>
						({ "Fluid.GarbageCollection.RunSweep": true })[name],
				},
			});
			const { container: container_gcEnabled } = await client_gcEnabled.createContainer(
				schema,
				compatibilityMode,
			);
			assert.strictEqual(
				(
					container_gcEnabled as unknown as { container: { mc: MonitoringContext } }
				).container.mc.config.getBoolean("Fluid.GarbageCollection.RunSweep"),
				true,
				"Expected GC to be able to enable GC via config provider",
			);
		});

		/**
		 * Scenario: Ensure that the types of 'initialObjects' are preserved when the container
		 * schema type is statically known.
		 */
		describe("'initialObjects'", function () {
			it("preserves 'SharedMap' type", async function () {
				const { container } = await client.createContainer(
					{
						initialObjects: {
							map: SharedMap,
						},
					},
					compatibilityMode,
				);

				// Ensure that the 'map' API is accessible without casting or suppressing lint rules:
				assert.equal(container.initialObjects.map.get("nonexistent"), undefined);
			});

			it("preserves 'SharedTree' type", async function () {
				// SharedTree is not supported in compatibilityMode "1", because it requires idCompressor to be enabled.
				if (compatibilityMode === "1") {
					this.skip();
				}
				const { container } = await client.createContainer(
					{
						initialObjects: {
							tree: SharedTree,
						},
					},
					compatibilityMode,
				);

				// Ensure that the 'tree' API is accessible without casting or suppressing lint rules:
				const tree = container.initialObjects.tree;

				// Apply Schema to returned SharedTree.
				const _ = new SchemaFactory("test");

				class RootNode extends _.object("Root", {
					itWorks: _.string,
				}) {}

				const view = tree.schematize(
					new TreeConfiguration(
						RootNode,
						() =>
							new RootNode({
								itWorks: "yes",
							}),
					),
				);

				// Ensure root node is correctly typed.
				assert.equal(view.root.itWorks, "yes");
			});
		});
	});
}
