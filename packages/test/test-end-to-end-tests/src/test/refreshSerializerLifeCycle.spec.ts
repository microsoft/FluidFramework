/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { generatePairwiseOptions } from "@fluid-private/test-pairwise-generator";
import { describeCompat } from "@fluid-private/test-version-utils";
import type { IContainerExperimental } from "@fluidframework/container-loader/internal";
import { DefaultSummaryConfiguration } from "@fluidframework/container-runtime/internal";
import type {
	IFluidHandle,
	ConfigTypes,
	IConfigProviderBase,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces/internal";
import { Deferred } from "@fluidframework/core-utils/internal";
import { SharedMap, type ISharedMap } from "@fluidframework/map/internal";
import {
	ITestFluidObject,
	timeoutPromise,
	DataObjectFactoryType,
	createAndAttachContainer,
	timeoutAwait,
	waitForContainerConnection,
	type ChannelFactoryRegistry,
	type ITestObjectProvider,
} from "@fluidframework/test-utils/internal";

import { wrapObjectAndOverride } from "../mocking.js";

// eslint-disable-next-line import/no-internal-modules
import { loadContainerWithDeferredConnection } from "./offline/offlineTestsUtils.js";

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
	useLoadingGroupIdForSnapshotFetch: [true, false],
	timeoutRefreshInOriginalContainer: [true, false],
	timeoutRefreshInLoadedContainer: [true, false],
});

describeCompat("Refresh snapshot lifecycle", "NoCompat", (getTestObjectProvider, apis) => {
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

	const createDataStoreWithGroupId = async (dataObject: ITestFluidObject, groupId: string) => {
		const containerRuntime = dataObject.context.containerRuntime;
		const packagePath = dataObject.context.packagePath;
		const dataStore = await containerRuntime.createDataStore(packagePath, groupId);
		dataObject.root.set(groupId, dataStore.entryPoint);
		return (await dataStore.entryPoint.get()) as ITestFluidObject;
	};

	const getDataStoreWithGroupId = async (dataObject: ITestFluidObject, groupId: string) => {
		const handle = dataObject.root.get<IFluidHandle<ITestFluidObject>>(groupId);
		assert(handle !== undefined, "groupId handle should exist");
		const dataStore = await handle.get();
		return dataStore;
	};

	for (const testConfig of testConfigs) {
		it(`Snapshot refresh life cycle: ${JSON.stringify(
			testConfig ?? "undefined",
		)}`, async () => {
			const provider: ITestObjectProvider = getTestObjectProvider();
			if (
				testConfig.useLoadingGroupIdForSnapshotFetch === true &&
				provider.driver.type !== "local"
			) {
				return;
			}
			let snapshotRefreshTimeoutMs;
			if (
				testConfig.timeoutRefreshInOriginalContainer ||
				testConfig.timeoutRefreshInLoadedContainer
			) {
				snapshotRefreshTimeoutMs =
					provider.driver.type === "local" ||
					provider.driver.type === "t9s" ||
					provider.driver.type === "tinylicious"
						? 100
						: 1000;
			}
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
						"Fluid.Container.UseLoadingGroupIdForSnapshotFetch":
							testConfig.useLoadingGroupIdForSnapshotFetch,
						"Fluid.Container.snapshotRefreshTimeoutMs": snapshotRefreshTimeoutMs,
					}),
				},
			};

			const loader = provider.makeTestLoader(testContainerConfig);
			// Original container. It will help us to send remote ops
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
			let i = 0;
			let j = 0;
			map.set(`${i}`, i++);
			// first container that will be stashed. It could have saved, pending or remote ops
			// at the moment of stashing.
			const container1: IContainerExperimental =
				await provider.loadTestContainer(testContainerConfig);
			await waitForContainerConnection(container1);
			const dataStore1 = (await container1.getEntryPoint()) as ITestFluidObject;
			const map1 = await dataStore1.getSharedObject<ISharedMap>(mapId);

			const groupId = "groupId";
			const groupIdDataObject = await createDataStoreWithGroupId(dataStore, groupId);
			await provider.ensureSynchronized();
			const groupIdDataObject1 = await getDataStoreWithGroupId(dataStore1, groupId);

			if (testConfig.savedOps) {
				for (let k = 0; k < 10; k++) {
					map.set(`${i}`, i++);
					groupIdDataObject.root.set(`${j}`, j++);
				}
				await waitForSummary(container1);
				if (testConfig.timeoutRefreshInOriginalContainer) {
					await timeoutPromise((resolve) => {
						setTimeout(() => {
							resolve();
						}, 105);
					});
				}
				await provider.ensureSynchronized();
			}
			if (testConfig.pendingOps) {
				await waitForContainerConnection(container1);
				await provider.opProcessingController.pauseProcessing(container1);
				map1.set(`${i}`, i++);
				map1.set(`${i}`, i++);
				groupIdDataObject1.root.set(`${j}`, j++);
			}
			if (testConfig.remoteOps) {
				map.set(`${i}`, i++);
				map.set(`${i}`, i++);
				groupIdDataObject.root.set(`${j}`, j++);
				await provider.ensureSynchronized(container);
			}

			const pendingOps = await container1.closeAndGetPendingLocalState?.();
			assert.ok(pendingOps);

			if (testConfig.summaryWhileOffline) {
				map.set(`${i}`, i++);
				await waitForSummary(container);
			}

			// container loaded from previous pending state. The snapshot should refresh
			// in case a summary has already happened. Such snapshot could be the first one to
			// have a data store with groupId
			let container2: IContainerExperimental;
			if (testConfig.loadOffline) {
				const offlineObject = await loadContainerWithDeferredConnection(
					testContainerConfig,
					provider,
					{ url },
					pendingOps,
				);
				container2 = offlineObject.container;
			} else {
				container2 = await loader.resolve({ url }, pendingOps);
			}
			const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
			const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
			const groupIdDataObject2 = await getDataStoreWithGroupId(dataStore2, groupId);
			const summaryExists = testConfig.savedOps || testConfig.summaryWhileOffline;

			// We can only wait for snapshot refresh if a summary exists and we're online
			if (testConfig.waitForRefresh && summaryExists && !testConfig.loadOffline) {
				await timeoutAwait(getLatestSnapshotInfoP.promise, {
					errorMsg: "Timeout on waiting for getLatestSnapshotInfo",
				});
				if (testConfig.timeoutRefreshInLoadedContainer) {
					await timeoutPromise((resolve) => {
						setTimeout(() => {
							resolve();
						}, 105);
					});
				}
			}

			// we can't produce a summary while offline
			if (testConfig.savedOps2 && !testConfig.loadOffline) {
				map2.set(`${i}`, i++);
				groupIdDataObject2.root.set(`${j}`, j++);
				await waitForSummary(container2);
				await provider.ensureSynchronized();
			}

			if (testConfig.pendingOps2) {
				if (!testConfig.loadOffline) {
					// making sure container is already connected before pausing processing
					await waitForContainerConnection(container2);
					await provider.opProcessingController.pauseProcessing(container2);
				}
				map2.set(`${i}`, i++);
				map2.set(`${i}`, i++);
				groupIdDataObject2.root.set(`${j}`, j++);
			}

			const pendingOps2 = await container2.closeAndGetPendingLocalState?.();
			// first container which loads from a snapshot with groupId
			const container3: IContainerExperimental = await loader.resolve({ url }, pendingOps2);
			const dataStore3 = (await container3.getEntryPoint()) as ITestFluidObject;
			const map3 = await dataStore3.getSharedObject<ISharedMap>(mapId);
			const groupIdDataObject3 = await getDataStoreWithGroupId(dataStore3, groupId);
			await waitForContainerConnection(container3, true);
			await provider.ensureSynchronized();

			// last case with both saved and pending ops
			map3.set(`${i}`, i++);
			groupIdDataObject3.root.set(`${j}`, j++);
			await waitForSummary(container3);
			await provider.opProcessingController.pauseProcessing(container3);
			map3.set(`${i}`, i++);
			map3.set(`${i}`, i++);
			groupIdDataObject3.root.set(`${j}`, j++);

			const pendingOps3 = await container3.closeAndGetPendingLocalState?.();
			// container created just for validation.
			const container4: IContainerExperimental = await loader.resolve({ url }, pendingOps3);
			const dataStore4 = (await container4.getEntryPoint()) as ITestFluidObject;
			const map4 = await dataStore4.getSharedObject<ISharedMap>(mapId);
			const groupIdDataObject4 = await getDataStoreWithGroupId(dataStore4, groupId);
			await waitForContainerConnection(container4, true);
			await provider.ensureSynchronized();

			assert.strictEqual(map4.size, i);
			for (let k = 0; k < i; k++) {
				assert.strictEqual(map4.get(`${k}`), k);
			}
			// that +1 is the mapId key.
			assert.strictEqual(groupIdDataObject4.root.size, j + 1);
			for (let l = 0; l < j; l++) {
				assert.strictEqual(groupIdDataObject4.root.get(`${l}`), l);
			}
		});
	}
});
