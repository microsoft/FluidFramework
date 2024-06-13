/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AzureClient } from "@fluidframework/azure-client";
import { ConnectionState } from "@fluidframework/container-loader";
import { ContainerSchema, type IFluidContainer } from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map/internal";
import { timeoutPromise } from "@fluidframework/test-utils/internal";
import { AxiosResponse } from "axios";

import {
	createAzureClient,
	createContainerFromPayload,
	getContainerIdFromPayloadResponse,
} from "./AzureClientFactory.js";
import * as ephemeralSummaryTrees from "./ephemeralSummaryTrees.js";
import { getTestMatrix } from "./utils.js";

const testMatrix = getTestMatrix();
for (const testOpts of testMatrix) {
	describe(`viewContainerVersion scenarios (${testOpts.variant})`, () => {
		const isEphemeral: boolean = testOpts.options.isEphemeral;
		const connectTimeoutMs = 10_000;
		let client: AzureClient;
		const schema = {
			initialObjects: {
				map1: SharedMap,
			},
		} satisfies ContainerSchema;

		beforeEach("createAzureClient", () => {
			client = createAzureClient();
		});

		beforeEach("skipForNonAzure", async function () {
			if (process.env.FLUID_CLIENT !== "azure") {
				this.skip();
			}
		});

		beforeEach("skipForEphemeral", async function () {
			if (isEphemeral) {
				this.skip();
			}
		});

		/**
		 * Scenario: test if Azure Client can provide versions of the container.
		 *
		 * Expected behavior: an error should not be thrown nor should a rejected promise
		 * be returned. Upon creation, we should recieve back 1 version of the container.
		 */
		it("can get versions of current document", async () => {
			let containerId: string;
			let container: IFluidContainer;
			if (isEphemeral) {
				const containerResponse: AxiosResponse | undefined =
					await createContainerFromPayload(
						ephemeralSummaryTrees.getVersionsOfCurrentDocument,
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
			const resources = client.getContainerVersions(containerId);
			await assert.doesNotReject(
				resources,
				() => true,
				"could not get versions of the container",
			);

			const versions = await resources;
			assert.strictEqual(versions.length, 1, "Container should have exactly one version.");
		});

		/**
		 * Scenario: test if Azure Client can handle bad document ID when versions are requested.
		 *
		 * Expected behavior: Client should throw an error.
		 */
		it("can handle bad document id when requesting versions", async () => {
			const resources = client.getContainerVersions("badid");
			const errorFn = (error: Error): boolean => {
				assert.notStrictEqual(error.message, undefined, "Azure Client error is undefined");
				assert.strictEqual(
					error.message,
					"R11s fetch error: Document is deleted and cannot be accessed.",
					`Unexpected error: ${error.message}`,
				);
				return true;
			};
			await assert.rejects(
				resources,
				errorFn,
				"We should not be able to get container versions.",
			);
		});

		/**
		 * Scenario: test if Azure Client can retrieve a specified version of a container.
		 *
		 * Expected behavior: an error should not be thrown nor should a rejected promise
		 * be returned.
		 */
		it("can view container version successfully", async () => {
			let containerId: string;
			let container: IFluidContainer;
			if (isEphemeral) {
				const containerResponse: AxiosResponse | undefined =
					await createContainerFromPayload(
						ephemeralSummaryTrees.copyDocumentSuccessfully,
						"test-user-id-1",
						"test-user-name-1",
					);
				containerId = getContainerIdFromPayloadResponse(containerResponse);
			} else {
				({ container } = await client.createContainer(schema, "2"));
				containerId = await container.attach();

				if (container.connectionState !== ConnectionState.Connected) {
					await timeoutPromise(
						(resolve) => container.once("connected", () => resolve()),
						{
							durationMs: connectTimeoutMs,
							errorMsg: "container connect() timeout",
						},
					);
				}
			}

			const versions = await client.getContainerVersions(containerId);
			assert.notStrictEqual(versions.length, 0, "There should be at least one version");
			const viewContainerVersionAttempt = client.viewContainerVersion(
				containerId,
				schema,
				versions[0],
				"2",
			);
			await assert.doesNotReject(viewContainerVersionAttempt);
			const { container: containerView } = await viewContainerVersionAttempt;
			assert.notStrictEqual(containerView.initialObjects.map1, undefined);
		});

		/**
		 * Scenario: test if Azure Client observes correct DDS values when viewing version.
		 *
		 * Expected behavior: DDS values should reflect their values from the version.
		 */
		it("has correct DDS values when viewing container version", async () => {
			let containerId: string;
			let container: IFluidContainer;
			let valueAtCreate: string | undefined = "expected-value";
			let map1: SharedMap;
			const testKey = "new-key";
			const expectedValue = "expected-value";
			if (isEphemeral) {
				const containerResponse: AxiosResponse | undefined =
					await createContainerFromPayload(
						ephemeralSummaryTrees.copyDDSValuesWhenCopyingContainer,
						"test-user-id-1",
						"test-user-name-1",
					);
				containerId = getContainerIdFromPayloadResponse(containerResponse);
				({ container } = await client.getContainer(containerId, schema, "2"));
				map1 = container.initialObjects.map1 as SharedMap;
			} else {
				({ container } = await client.createContainer(schema, "2"));

				map1 = container.initialObjects.map1 as SharedMap;
				map1.set(testKey, expectedValue);
				valueAtCreate = map1.get(testKey);

				containerId = await container.attach();
			}

			if (container.connectionState !== ConnectionState.Connected) {
				await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
					durationMs: connectTimeoutMs,
					errorMsg: "container connect() timeout",
				});
			}
			// Set a new value to the map - we do not expect to see this when loading the older version
			map1.set(testKey, "some-newer-value");

			const versions = await client.getContainerVersions(containerId);
			assert.notStrictEqual(versions.length, 0, "There should be at least one version");
			// Get the oldest version, which we expect is the version from attach and should still have the old value.
			const viewContainerVersionAttempt = client.viewContainerVersion(
				containerId,
				schema,
				versions[versions.length - 1],
				"2",
			);
			await assert.doesNotReject(viewContainerVersionAttempt);
			const { container: containerView } = await viewContainerVersionAttempt;
			assert.strictEqual(containerView.initialObjects.map1.get(testKey), valueAtCreate);
		});

		/**
		 * Scenario: test if Azure Client can handle non-existing container when trying to view a version
		 *
		 * Expected behavior: client should throw an error.
		 */
		it("can handle non-existing container", async () => {
			const resources = client.viewContainerVersion(
				"badidonviewversion",
				schema,
				{
					id: "whatever",
				},
				"2",
			);
			const errorFn = (error: Error): boolean => {
				assert.notStrictEqual(error.message, undefined, "Azure Client error is undefined");
				assert.strictEqual(
					error.message,
					"R11s fetch error: Document is deleted and cannot be accessed.",
					`Unexpected error: ${error.message}`,
				);
				return true;
			};

			await assert.rejects(
				resources,
				errorFn,
				"We should not be able to view the container.",
			);
		});
	});
}
