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
} from "@fluidframework/test-utils/internal";
import type { IContainerExperimental } from "@fluidframework/container-loader/internal";
import {
	type IContainerRuntimeOptions,
	DefaultSummaryConfiguration,
} from "@fluidframework/container-runtime/internal";
import type {
	ConfigTypes,
	IConfigProviderBase,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces/internal";
import { SharedMap, type ISharedMap } from "@fluidframework/map/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import type { IHostLoader } from "@fluidframework/container-definitions/internal";
import { wrapObjectAndOverride } from "../mocking.js";

const testConfigs = generatePairwiseOptions({
	savedOps: [true, false],
	pendingOps: [true, false],
	savedOps2: [true, false],
	pendingOps2: [true, false],
	summaryWhileOffline: [true, false],
	waitForRefresh: [true,false],
});

describeCompat("Validate Attach lifecycle", "NoCompat", (getTestObjectProvider, apis) => {
	const mapId = "map";
	const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
	const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
		getRawConfig: (name: string): ConfigTypes => settings[name],
	});
	const runtimeOptions: IContainerRuntimeOptions = {
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
		enableRuntimeIdCompressor: "on",
	};

	const waitForSummary = async (container) => {
		await timeoutPromise((resolve, reject) => {
			let summarized = false;
			container.on("op", (op: { type: string; }) => {
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
		let provider: ITestObjectProvider;
		let mockLogger: MockLogger;
		let getLatestSnapshotInfoP: Deferred<void>;
		let loader: IHostLoader;
		let container: IContainerExperimental;
		let url;
		let map: ISharedMap;
		let dataStore: ITestFluidObject;
		let testContainerConfig;
		beforeEach(async () => {
			provider = getTestObjectProvider();
			mockLogger = new MockLogger();
			getLatestSnapshotInfoP = new Deferred<void>();
			testContainerConfig = {
				fluidDataObjectType: DataObjectFactoryType.Test,
				registry,
				runtimeOptions,
				loaderProps: {
					logger: wrapObjectAndOverride<ITelemetryBaseLogger>(mockLogger, {
						send: (tb) => (event) => {
							tb.send(event);
							if (
								event.eventName ===
								"fluid:telemetry:serializedStateManager:SnapshotRefreshed"
								|| event.eventName ===
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

			loader = provider.makeTestLoader(testContainerConfig);
			container = await createAndAttachContainer(
				provider.defaultCodeDetails,
				loader,
				provider.driver.createCreateNewRequest(provider.documentId),
			);
			provider.updateDocumentId(container.resolvedUrl);
			url = await container.getAbsoluteUrl("");
			dataStore = (await container.getEntryPoint()) as ITestFluidObject;
			map = await dataStore.getSharedObject<ISharedMap>(mapId);
			map.set("hello", "world");
		})
		it(`Snapshot refresh life cycle: ${JSON.stringify(
			testConfig ?? "undefined",
		)}`, async () => {
			const container1: IContainerExperimental = await provider.loadTestContainer(testContainerConfig);
			await waitForContainerConnection(container1);
			const dataStore1 = (await container1.getEntryPoint()) as ITestFluidObject;
			const map1 = await dataStore1.getSharedObject<ISharedMap>(mapId);

			let i = 0;
			if(testConfig.savedOps) {
				map1.set(`${i}`, i);
				i++;
				await waitForSummary(container1);
				await provider.ensureSynchronized();
			}
			if(testConfig.pendingOps) {
				await provider.opProcessingController.pauseProcessing(container1);
				assert(dataStore1.runtime.deltaManager.outbound.paused);
				map1.set(`${i}`, i++);
				map1.set(`${i}`, i++);
			}
			
			const pendingOps = await container1.closeAndGetPendingLocalState?.();
			assert.ok(pendingOps);

			if(testConfig.summaryWhileOffline){
				map.set(`${i}`, i++);
				await waitForSummary(container);
			}
			
			const container2: IContainerExperimental = await loader.resolve({ url }, pendingOps);
			const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
			const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
			if(testConfig.waitForRefresh && (testConfig.savedOps || testConfig.summaryWhileOffline)){
				await timeoutAwait(getLatestSnapshotInfoP.promise, {
					errorMsg: "Timeout on waiting for getLatestSnapshotInfo",
				});
			}

			if(testConfig.savedOps2) {
				map2.set(`${i}`, i++);
				await waitForSummary(container2);
				await provider.ensureSynchronized();
			}
			if(testConfig.pendingOps2){
				await provider.opProcessingController.pauseProcessing(container2);
				assert(dataStore2.runtime.deltaManager.outbound.paused);
				map2.set(`${i}`, i++);
				map2.set(`${i}`, i++);
				provider.opProcessingController.resumeProcessing();
			}
			
			const pendingOps2 = await container2.closeAndGetPendingLocalState?.();
			const container3: IContainerExperimental = await loader.resolve({ url }, pendingOps2);
			const dataStore3 = (await container3.getEntryPoint()) as ITestFluidObject;
			const map3 = await dataStore3.getSharedObject<ISharedMap>(mapId);
			await waitForContainerConnection(container3, true);
			await provider.ensureSynchronized();
			for(let k=0; k<i; k++){
				assert.strictEqual(map3.get(`${k}`), k);
			}
		});
	}
});
