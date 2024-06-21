/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AzureClient } from "@fluidframework/azure-client";
import { ConnectionState } from "@fluidframework/container-loader";
import {
	ContainerSchema,
	type CompatibilityMode,
	type IFluidContainer,
} from "@fluidframework/fluid-static";
import { SharedMap } from "@fluidframework/map/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import { timeoutPromise } from "@fluidframework/test-utils/internal";
import type { AxiosResponse } from "axios";

// eslint-disable-next-line import/no-internal-modules
import type { IGarbageCollectorConfigs } from "../../../../../runtime/container-runtime/lib/gc/gcDefinitions.js";

import {
	createAzureClient,
	createContainerFromPayload,
	getContainerIdFromPayloadResponse,
} from "./AzureClientFactory.js";
import * as ephemeralSummaryTrees from "./ephemeralSummaryTrees.js";
import { getTestMatrix } from "./utils.js";

const testMatrix = getTestMatrix();
for (const testOpts of testMatrix) {
	describe.only(`Garbage collection with AzureClient (${testOpts.variant})`, () => {
		const connectTimeoutMs = 10_000;
		const isEphemeral: boolean = testOpts.options.isEphemeral;
		let client: AzureClient;
		let mockLogger: MockLogger;
		const schema = {
			initialObjects: {
				map1: SharedMap,
			},
		} satisfies ContainerSchema;

		beforeEach("createAzureClient", () => {
			mockLogger = new MockLogger();
			client = createAzureClient(undefined /* id */, undefined /* name */, mockLogger);
		});

		async function createFluidContainer(
			compatibilityMode: CompatibilityMode,
		): Promise<IFluidContainer> {
			if (isEphemeral) {
				const containerResponse: AxiosResponse | undefined = await createContainerFromPayload(
					ephemeralSummaryTrees.createContainerWithSharedTree,
					"test-user-id-1",
					"test-user-name-1",
				);
				const containerId = getContainerIdFromPayloadResponse(containerResponse);
				const result = await client.getContainer(containerId, schema, compatibilityMode);
				return result.container;
			}

			const { container } = await client.createContainer(schema, compatibilityMode);
			await container.attach();
			return container;
		}

		async function waitForConnected(container: IFluidContainer): Promise<void> {
			if (container.connectionState !== ConnectionState.Connected) {
				await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
					durationMs: connectTimeoutMs,
					errorMsg: "container connect() timeout",
				});
			}
		}

		/**
		 * Validates that the GarbageCollector event is logged and the GC configs are as expected.
		 * @param compatibilityMode - Used in assert messages to tell which compat mode the validation is running in.
		 */
		function validateGCConfigs(compatibilityMode: CompatibilityMode): void {
			const gcConfigString = mockLogger.events.find(
				(event) =>
					event.eventName ===
					"fluid:telemetry:ContainerRuntime:GarbageCollector:GarbageCollectorLoaded",
			)?.gcConfigs as string;
			assert(
				gcConfigString !== undefined,
				`GC configs not found for compat mode ${compatibilityMode}`,
			);
			const gcConfigs = JSON.parse(gcConfigString) as IGarbageCollectorConfigs;
			// Sweep should be enabled for documents but it should not run. Tombstone features should also be disabled.
			assert.strictEqual(
				gcConfigs.gcEnabled,
				true,
				`GC not enabled for compat mode ${compatibilityMode}`,
			);
			assert.strictEqual(
				gcConfigs.sweepEnabled,
				true,
				`Sweep not enabled for compat mode ${compatibilityMode}`,
			);
			assert.strictEqual(
				gcConfigs.shouldRunSweep,
				"NO",
				`Sweep should not run for compat mode ${compatibilityMode}`,
			);
			assert.strictEqual(
				gcConfigs.throwOnTombstoneLoad,
				false,
				`Tombstone should not throw on load for compat mode ${compatibilityMode}`,
			);
			assert.strictEqual(
				gcConfigs.throwOnTombstoneUsage,
				false,
				`Tombstone should not throw on usage for compat mode ${compatibilityMode}`,
			);
			assert.strictEqual(
				gcConfigs.tombstoneAutorecoveryEnabled,
				false,
				`Tombstone autorecovery should be disabled for compat mode ${compatibilityMode}`,
			);
		}

		/**
		 * Garbage collection should be enabled along with sweep for documents created via AzureClient. However, sweep
		 * along with tombstone should be disabled. Basically, these documents are eligible for sweep but sweep won't
		 * run on them unless explicitly enabled via configs.
		 */
		it("should have sweep and tombstone disabled", async () => {
			const containerCompatMode1 = await createFluidContainer("1");
			await waitForConnected(containerCompatMode1);
			validateGCConfigs("1");

			mockLogger.clear();

			const containerCompatMode2 = await createFluidContainer("2");
			await waitForConnected(containerCompatMode2);
			validateGCConfigs("2");
		});
	});
}
