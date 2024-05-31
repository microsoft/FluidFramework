/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { generatePairwiseOptions } from "@fluid-private/test-pairwise-generator";
import { describeCompat } from "@fluid-private/test-version-utils";
import { Deferred } from "@fluidframework/core-utils/internal";
import {
	ITestFluidObject,
	timeoutPromise,
	DataObjectFactoryType,
	createAndAttachContainer,
	timeoutAwait,
	waitForContainerConnection,
	type ChannelFactoryRegistry,
	type ITestObjectProvider,
	type ITestContainerConfig,
} from "@fluidframework/test-utils/internal";
import type { IContainerExperimental } from "@fluidframework/container-loader/internal";
import { DefaultSummaryConfiguration } from "@fluidframework/container-runtime/internal";
import type {
	ConfigTypes,
	IConfigProviderBase,
	IRequest,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces/internal";
import { SharedMap, type ISharedMap } from "@fluidframework/map/internal";
import type { IDocumentServiceFactory } from "@fluidframework/driver-definitions/internal";
import { wrapObjectAndOverride } from "../mocking.js";

const testConfigs = generatePairwiseOptions({
	savedOps: [true, false],
	pendingOps: [true, false],
	remoteOps: [true, false],
	savedOps2: [true, false],
	pendingOps2: [true, false],
	summaryWhileOffline: [true, false],
	waitForRefresh: [true, false],
	idCompressorEnabled: ["on", undefined, "delayed"],
	loadOffline: [true, false],
});

/**
 * Load a Container using testContainerConfig and the given testObjectProvider,
 * Deferring connection to the service until the returned connect function is called
 * (simulating returning from offline)
 *
 * @param testObjectProvider - For accessing Loader/Driver
 * @param request - Request to use when loading
 * @param pendingLocalState - (Optional) custom PendingLocalState to load from. Defaults to using getPendingOps helper if omitted.
 * @returns A container instance with a connect function to unblock the Driver (simulating coming back from offline)
 */
async function loadOffline(
	testContainerConfig: ITestContainerConfig,
	testObjectProvider: ITestObjectProvider,
	request: IRequest,
	pendingLocalState: string,
): Promise<IContainerExperimental> {
	const p = new Deferred();
	// This documentServiceFactory will wait for the promise p to resolve before connecting to the service
	const documentServiceFactory = wrapObjectAndOverride<IDocumentServiceFactory>(
		testObjectProvider.documentServiceFactory,
		{
			createDocumentService: {
				connectToDeltaStream: (ds) => async (client) => {
					await p.promise;
					return ds.connectToDeltaStream(client);
				},
				connectToDeltaStorage: (ds) => async () => {
					await p.promise;
					return ds.connectToDeltaStorage();
				},
				connectToStorage: (ds) => async () => {
					await p.promise;
					return ds.connectToStorage();
				},
			},
		},
	);

	const loader = testObjectProvider.createLoader(
		[
			[
				testObjectProvider.defaultCodeDetails,
				testObjectProvider.createFluidEntryPoint(testContainerConfig),
			],
		],
		{ ...testContainerConfig.loaderProps, documentServiceFactory },
	);
	const container: IContainerExperimental = await loader.resolve(request, pendingLocalState);
	return container;
}

describeCompat("Validate Attach lifecycle", "NoCompat", (getTestObjectProvider, apis) => {
	const mapId = "map";
	const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
	const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
		getRawConfig: (name: string): ConfigTypes => settings[name],
	});
	const runtimeOptions = (idCompressorEnabled) => {
		return {
			summaryOptions: {
				summaryConfigOverrides: {
					...DefaultSummaryConfiguration,
					...{
						maxTime: 5000 * 12,
						maxAckWaitTime: 120000,
						maxOps: 1,
						initialSummarizerDelayMs: 20,
					},
				},
			},
			enableRuntimeIdCompressor: idCompressorEnabled,
		};
	};

	const waitForSummary = async (container) => {
		await timeoutPromise((resolve, reject) => {
			let summarized = false;
			container.on("op", (op: { type: string }) => {
				if (op.type === "summarize") {
					summarized = true;
				} else if (summarized && op.type === "summaryAck") {
					resolve();
				} else if (op.type === "summaryNack") {
					reject(new Error("summaryNack"));
				}
			});
		});
	};

	for (const testConfig of testConfigs) {
		it(`Snapshot refresh life cycle: ${JSON.stringify(
			testConfig ?? "undefined",
		)}`, async () => {
			const provider: ITestObjectProvider = getTestObjectProvider();
			const getLatestSnapshotInfoP = new Deferred<void>();
			const testContainerConfig = {
				fluidDataObjectType: DataObjectFactoryType.Test,
				registry,
				runtimeOptions: runtimeOptions(testConfig.idCompressorEnabled),
				loaderProps: {
					logger: wrapObjectAndOverride<ITelemetryBaseLogger>(provider.logger, {
						send: (tb) => (event) => {
							tb.send(event);
							if (
								event.eventName ===
									"fluid:telemetry:serializedStateManager:SnapshotRefreshed" ||
								event.eventName ===
									"fluid:telemetry:serializedStateManager:OldSnapshotFetchWhileRefreshing"
							) {
								getLatestSnapshotInfoP.resolve();
							}
						},
					}),
					configProvider: configProvider({
						"Fluid.Container.enableOfflineLoad": true,
						"Fluid.Container.enableOfflineSnapshotRefresh": true,
					}),
				},
			};

			const loader = provider.makeTestLoader(testContainerConfig);
			const container = await createAndAttachContainer(
				provider.defaultCodeDetails,
				loader,
				provider.driver.createCreateNewRequest(provider.documentId),
			);
			provider.updateDocumentId(container.resolvedUrl);
			const url = await container.getAbsoluteUrl("");
			assert(url);
			const dataStore = (await container.getEntryPoint()) as ITestFluidObject;
			const map = await dataStore.getSharedObject<ISharedMap>(mapId);
			map.set("hello", "world");
			const container1: IContainerExperimental =
				await provider.loadTestContainer(testContainerConfig);
			await waitForContainerConnection(container1);
			const dataStore1 = (await container1.getEntryPoint()) as ITestFluidObject;
			const map1 = await dataStore1.getSharedObject<ISharedMap>(mapId);

			let i = 0;
			if (testConfig.savedOps) {
				map1.set(`${i}`, i++);
				await waitForSummary(container1);
				await provider.ensureSynchronized();
			}
			if (testConfig.pendingOps) {
				await waitForContainerConnection(container1);
				await provider.opProcessingController.pauseProcessing(container1);
				map1.set(`${i}`, i++);
				map1.set(`${i}`, i++);
			}
			if (testConfig.remoteOps) {
				map.set(`${i}`, i++);
				map.set(`${i}`, i++);
			}

			const pendingOps = await container1.closeAndGetPendingLocalState?.();
			assert.ok(pendingOps);

			if (testConfig.summaryWhileOffline) {
				await waitForSummary(container);
			}

			const container2: IContainerExperimental = testConfig.loadOffline
				? await loadOffline(testContainerConfig, provider, { url }, pendingOps)
				: await loader.resolve({ url }, pendingOps);
			const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
			const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
			const summaryExists = testConfig.savedOps || testConfig.summaryWhileOffline;

			// We can only wait for snapshot refresh if a summary exists and we're online
			if (testConfig.waitForRefresh && summaryExists && !testConfig.loadOffline) {
				await timeoutAwait(getLatestSnapshotInfoP.promise, {
					errorMsg: "Timeout on waiting for getLatestSnapshotInfo",
				});
			}

			// we can't produce a summary offline
			if (testConfig.savedOps2 && !testConfig.loadOffline) {
				map2.set(`${i}`, i++);
				await waitForSummary(container2);
				await provider.ensureSynchronized();
			}

			if (testConfig.pendingOps2) {
				if (!testConfig.loadOffline)
					await provider.opProcessingController.pauseProcessing(container2);
				map2.set(`${i}`, i++);
				map2.set(`${i}`, i++);
			}

			const pendingOps2 = await container2.closeAndGetPendingLocalState?.();
			const container3: IContainerExperimental = await loader.resolve({ url }, pendingOps2);
			const dataStore3 = (await container3.getEntryPoint()) as ITestFluidObject;
			const map3 = await dataStore3.getSharedObject<ISharedMap>(mapId);
			await waitForContainerConnection(container3, true);
			await provider.ensureSynchronized();
			for (let k = 0; k < i; k++) {
				assert.strictEqual(map3.get(`${k}`), k);
			}
		});
	}
});
