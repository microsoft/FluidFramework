/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import { describeCompat } from "@fluid-private/test-version-utils";
import {
	LoaderHeader,
	type IContainer,
	type IHostLoader,
} from "@fluidframework/container-definitions/internal";
import type { IContainerExperimental } from "@fluidframework/container-loader/internal";
import type {
	ConfigTypes,
	IConfigProviderBase,
	IRequestHeader,
} from "@fluidframework/core-interfaces";
import type { ISharedMap } from "@fluidframework/map/internal";
import {
	type ITestObjectProvider,
	type ITestContainerConfig,
	createSummarizer,
	summarizeNow,
	type ChannelFactoryRegistry,
	createAndAttachContainer,
	DataObjectFactoryType,
	type ITestFluidObject,
	waitForContainerConnection,
	timeoutAwait,
} from "@fluidframework/test-utils/internal";

import { loadContainerOffline, generatePendingState } from "./offlineTestsUtils.js";

const loadSummarizerAndSummarize = async (
	provider: ITestObjectProvider,
	container: IContainer,
	testContainerConfig: ITestContainerConfig,
	summaryVersion?: string,
) => {
	const { summarizer, container: summarizingContainer } = await createSummarizer(
		provider,
		container,
		testContainerConfig,
		summaryVersion,
	);
	await provider.ensureSynchronized();
	const result = await summarizeNow(summarizer);
	summarizingContainer.close();
	return result.summaryVersion;
};

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

describeCompat(
	"Offline tests that wait for a summary",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const mapId = "map";
		const { SharedMap } = apis.dds;
		const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
		let provider: ITestObjectProvider;
		let loader: IHostLoader;
		let container: IContainerExperimental;
		let url: any;
		let map1: ISharedMap;
		let dataStore1: ITestFluidObject;
		const testContainerConfig: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry,
			loaderProps: {
				configProvider: configProvider({
					"Fluid.Container.enableOfflineLoad": true,
					"Fluid.Sequence.intervalStickinessEnabled": true,
				}),
			},
		};
		const mainContainerConfig: ITestContainerConfig = {
			...testContainerConfig,
			runtimeOptions: {
				summaryOptions: {
					summaryConfigOverrides: {
						state: "disabled",
					},
				},
			},
		};

		beforeEach("setup", async () => {
			provider = getTestObjectProvider({ syncSummarizer: true });
			loader = provider.makeTestLoader(mainContainerConfig);
			container = await createAndAttachContainer(
				provider.defaultCodeDetails,
				loader,
				provider.driver.createCreateNewRequest(provider.documentId),
			);
			provider.updateDocumentId(container.resolvedUrl);
			url = await container.getAbsoluteUrl("");
			dataStore1 = (await container.getEntryPoint()) as ITestFluidObject;
			map1 = await dataStore1.getSharedObject<ISharedMap>(mapId);
			// force write connection.
			map1.set("1", "1");
		});

		it("works with summary while offline", async function () {
			const summaryVersion = await loadSummarizerAndSummarize(
				provider,
				container,
				testContainerConfig,
			);
			const pendingOps = await generatePendingState(
				testContainerConfig,
				provider,
				false, // Don't send ops from first container instance before closing
				async (c, d) => {
					const map: ISharedMap = await d.getSharedObject<ISharedMap>(mapId);
					map.set("stashed", "stashed");
				},
			);

			map1.set("2", "2");
			await loadSummarizerAndSummarize(
				provider,
				container,
				testContainerConfig,
				summaryVersion,
			);
			// intentionally not loading from new summary
			const container2 = await loader.resolve({ url }, pendingOps);
			const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
			const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
			await waitForContainerConnection(container2);
			await provider.ensureSynchronized();

			assert.strictEqual(map2.get("1"), "1", "failed to get key 1");
			assert.strictEqual(map2.get("2"), "2", "failed to get key 2");
			assert.strictEqual(map2.get("stashed"), "stashed", "failed to get stashed key");
		});

		it("load offline with blob redirect table", async function () {
			container.disconnect();
			const handleP = dataStore1.runtime.uploadBlob(stringToBuffer("blob contents", "utf8"));
			container.connect();
			const handle = await timeoutAwait(handleP, {
				errorMsg: "Timeout on waiting for handleP ",
			});
			map1.set("blob handle", handle);
			const handleGet = await timeoutAwait(handle.get(), {
				errorMsg: "Timeout on waiting for handleGet",
			});
			assert.strictEqual(bufferToString(handleGet, "utf8"), "blob contents");

			// wait for summary with redirect table
			await timeoutAwait(provider.ensureSynchronized(), {
				errorMsg: "Timeout on waiting for ensureSynchronized",
			});
			await timeoutAwait(
				loadSummarizerAndSummarize(provider, container, testContainerConfig),
				{
					errorMsg: "Timeout on waiting for summary",
				},
			);

			// should be able to load entirely offline
			const stashBlob = await timeoutAwait(
				generatePendingState(testContainerConfig, provider, true),
				{
					errorMsg: "Timeout on waiting for stashBlob",
				},
			);
			await timeoutAwait(
				loadContainerOffline(testContainerConfig, provider, { url }, stashBlob),
				{
					errorMsg: "Timeout on waiting for loadOffline",
				},
			);
		});

		it("applies stashed ops with no saved ops", async function () {
			// We want to test the case where we stash ops based on the sequence number of the snapshot we load from
			// So step 1 is to complete a summary so we can load from it.
			const summaryVersion = await loadSummarizerAndSummarize(
				provider,
				container,
				testContainerConfig,
			);

			// avoid our join op being saved (so saved ops is empty and the map op below has the right ref seq)
			const headers: IRequestHeader = {
				[LoaderHeader.loadMode]: { deltaConnection: "none" },
				[LoaderHeader.version]: summaryVersion,
			};
			const container2: IContainerExperimental = await loader.resolve({ url, headers });
			const dataStore2 = (await container2.getEntryPoint()) as ITestFluidObject;
			const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
			// generate ops with RSN === summary SN
			map2.set("2", "2");
			const stashBlob = await container2.closeAndGetPendingLocalState?.();
			assert(stashBlob);
			const pendingState = JSON.parse(stashBlob);

			// make sure the container loaded from summary and we have no saved ops
			assert.strictEqual(pendingState.savedOps.length, 0, "Expected no saved ops");
			assert(
				pendingState.pendingRuntimeState.pending.pendingStates[0].referenceSequenceNumber > 0,
				"Expected the pending state to have some ops with non-zero ref seq (should match the snapshot sequence number)",
			);

			// load container with pending ops, which should resend the op not sent by previous container
			const container3 = await loader.resolve({ url }, stashBlob);
			const dataStore3 = (await container3.getEntryPoint()) as ITestFluidObject;
			const map3 = await dataStore3.getSharedObject<ISharedMap>(mapId);
			await waitForContainerConnection(container3);
			await provider.ensureSynchronized();
			assert.strictEqual(map1.get("2"), "2", "failed to get key 2 on map1");
			assert.strictEqual(map3.get("2"), "2", "failed to get key 2 on map3");
		});

		it("can stash between summary op and ack", async function () {
			const waitForSummaryPromise = loadSummarizerAndSummarize(
				provider,
				container,
				testContainerConfig,
			);
			const pendingOps = await timeoutAwait(
				new Promise<string | undefined>((resolve, reject) =>
					container.on("op", (op) => {
						if (op.type === "summarize") {
							resolve(container.closeAndGetPendingLocalState?.());
						}
					}),
				),
				{
					errorMsg: "Timeout on waiting for summarize op",
				},
			);
			await waitForSummaryPromise;
			assert.ok(pendingOps);

			const container2 = await loader.resolve({ url }, pendingOps);
			await waitForContainerConnection(container2);
			await provider.ensureSynchronized();
		});
	},
);
