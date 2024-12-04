/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { IContainerExperimental } from "@fluidframework/container-loader/internal";
import {
	DefaultSummaryConfiguration,
	type IContainerRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import {
	ConfigTypes,
	IConfigProviderBase,
	type ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import { Deferred } from "@fluidframework/core-utils/internal";
import type { ISharedMap } from "@fluidframework/map/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	ChannelFactoryRegistry,
	ITestFluidObject,
	DataObjectFactoryType,
	createAndAttachContainer,
	createDocumentId,
	waitForContainerConnection,
	timeoutPromise,
	timeoutAwait,
} from "@fluidframework/test-utils/internal";

import { wrapObjectAndOverride } from "../mocking.js";

const mapId = "map";
const testKey = "test key";
const testValue = "test value";
const mockLogger = new MockLogger();

describeCompat("Snapshot refresh at loading", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedMap } = apis.dds;
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
			container.on("op", (op) => {
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

	it("snapshot was refreshed", async function () {
		const provider = getTestObjectProvider();
		// TODO: This test is consistently failing when ran against AFR. See ADO:7893
		if (provider.driver.type === "routerlicious" && provider.driver.endpointName === "frs") {
			this.skip();
		}
		const getLatestSnapshotInfoP = new Deferred<void>();
		const testContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry,
			runtimeOptions,
			loaderProps: {
				logger: wrapObjectAndOverride<ITelemetryBaseLogger>(mockLogger, {
					send: (tb) => (event) => {
						tb.send(event);
						if (
							event.eventName === "fluid:telemetry:serializedStateManager:SnapshotRefreshed"
						) {
							assert(event.snapshotSequenceNumber ?? 0 > 0, "snapshot was not refreshed");
							assert.strictEqual(
								event.firstProcessedOpSequenceNumber ?? 0,
								1,
								"first sequenced op was not saved",
							);
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
		const container: IContainerExperimental = await createAndAttachContainer(
			provider.defaultCodeDetails,
			loader,
			provider.driver.createCreateNewRequest(createDocumentId()),
		);

		const url = await container.getAbsoluteUrl("");
		assert(url, "no url");

		const dataStore = (await container.getEntryPoint()) as ITestFluidObject;
		const map = await dataStore.getSharedObject<ISharedMap>(mapId);
		map.set(testKey, testValue);
		await waitForSummary(container);
		const pendingOps = await container.closeAndGetPendingLocalState?.();
		assert.ok(pendingOps);
		// make sure we got stashed ops with seqnum === 0,
		assert(/sequenceNumber[^\w,}]*0/.test(pendingOps));

		const container1: IContainerExperimental = await loader.resolve({ url }, pendingOps);
		await timeoutAwait(getLatestSnapshotInfoP.promise, {
			errorMsg: "Timeout on waiting for getLatestSnapshotInfo",
		});
		const pendingOps2 = await container1.closeAndGetPendingLocalState?.();
		const container2: IContainerExperimental = await loader.resolve({ url }, pendingOps2);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
		await waitForContainerConnection(container2, true);
		await provider.ensureSynchronized();
		assert.strictEqual(map2.get(testKey), testValue);
	});

	it("snapshot was refreshed after some time", async function () {
		const provider = getTestObjectProvider();
		// TODO: This test is consistently failing when ran against AFR. See ADO:7893
		if (provider.driver.type === "routerlicious" && provider.driver.endpointName === "frs") {
			this.skip();
		}
		const getLatestSnapshotInfoP = new Deferred<void>();
		const testContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry,
			runtimeOptions,
			loaderProps: {
				logger: wrapObjectAndOverride<ITelemetryBaseLogger>(mockLogger, {
					send: (tb) => (event) => {
						tb.send(event);
						if (
							event.eventName === "fluid:telemetry:serializedStateManager:SnapshotRefreshed"
						) {
							assert(event.snapshotSequenceNumber ?? 0 > 0, "snapshot was not refreshed");
							assert.strictEqual(
								event.firstProcessedOpSequenceNumber ?? 0,
								1,
								"first sequenced op was not saved",
							);
							getLatestSnapshotInfoP.resolve();
						}
					},
				}),
				configProvider: configProvider({
					"Fluid.Container.enableOfflineLoad": true,
					"Fluid.Container.enableOfflineSnapshotRefresh": true,
					"Fluid.Container.snapshotRefreshTimeoutMs": 100,
				}),
			},
		};
		const loader = provider.makeTestLoader(testContainerConfig);
		const container: IContainerExperimental = await createAndAttachContainer(
			provider.defaultCodeDetails,
			loader,
			provider.driver.createCreateNewRequest(createDocumentId()),
		);

		const url = await container.getAbsoluteUrl("");
		assert(url, "no url");

		const dataStore = (await container.getEntryPoint()) as ITestFluidObject;
		const map = await dataStore.getSharedObject<ISharedMap>(mapId);
		map.set(testKey, testValue);
		await waitForSummary(container);
		await provider.ensureSynchronized();
		await timeoutAwait(getLatestSnapshotInfoP.promise, {
			errorMsg: "Timeout on waiting for getLatestSnapshotInfo",
		});
		const pendingOps = await container.closeAndGetPendingLocalState?.();
		assert.ok(pendingOps);

		const container2: IContainerExperimental = await loader.resolve({ url }, pendingOps);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
		await waitForContainerConnection(container2, true);
		await provider.ensureSynchronized();
		assert.strictEqual(map2.get(testKey), testValue);
	});

	it("snapshot was not refreshed", async () => {
		const provider = getTestObjectProvider();
		const getLatestSnapshotInfoP = new Deferred<void>();
		const testContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry,
			runtimeOptions,
			loaderProps: {
				logger: wrapObjectAndOverride<ITelemetryBaseLogger>(mockLogger, {
					send: (tb) => (event) => {
						tb.send(event);
						if (
							event.eventName ===
							"fluid:telemetry:serializedStateManager:OldSnapshotFetchWhileRefreshing"
						) {
							assert.strictEqual(event.category, "generic", "wrong event category");
							assert.strictEqual(
								event.snapshotSequenceNumber ?? -1,
								0,
								"snapshot was refreshed when it shouldn't",
							);
							assert.strictEqual(
								event.firstProcessedOpSequenceNumber ?? 0,
								1,
								"first sequenced op was not saved",
							);
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
		const container: IContainerExperimental = await createAndAttachContainer(
			provider.defaultCodeDetails,
			loader,
			provider.driver.createCreateNewRequest(createDocumentId()),
		);

		const url = await container.getAbsoluteUrl("");
		assert(url, "no url");

		const dataStore = (await container.getEntryPoint()) as ITestFluidObject;
		const map = await dataStore.getSharedObject<ISharedMap>(mapId);
		map.set(testKey, testValue);
		// not waiting for summary to reuse the stashed snapshot for new loaded containers
		const pendingOps = await container.closeAndGetPendingLocalState?.();
		assert.ok(pendingOps);
		// make sure we got stashed ops with seqnum === 0,
		assert(/sequenceNumber[^\w,}]*0/.test(pendingOps));

		const container1: IContainerExperimental = await loader.resolve({ url }, pendingOps);
		await timeoutAwait(getLatestSnapshotInfoP.promise, {
			errorMsg: "Timeout on waiting for getLatestSnapshotInfo",
		});
		const pendingOps2 = await container1.closeAndGetPendingLocalState?.();
		const container2: IContainerExperimental = await loader.resolve({ url }, pendingOps2);
		const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
		const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
		await waitForContainerConnection(container2, true);
		await provider.ensureSynchronized();
		assert.strictEqual(map2.get(testKey), testValue);
	});
});
