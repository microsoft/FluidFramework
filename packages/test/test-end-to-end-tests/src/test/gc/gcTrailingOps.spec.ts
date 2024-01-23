/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	ITestObjectProvider,
	waitForContainerConnection,
	createSummarizer,
	summarizeNow,
	ITestContainerConfig,
	mockConfigProvider,
} from "@fluidframework/test-utils";
import {
	describeCompat,
	ITestDataObject,
	TestDataObjectType,
} from "@fluid-private/test-version-utils";
import { stringToBuffer } from "@fluid-internal/client-utils";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { IGCRuntimeOptions } from "@fluidframework/container-runtime";
import { getGCStateFromSummary } from "./gcTestSummaryUtils.js";
import { defaultGCConfig } from "./gcTestConfigs.js";

describeCompat("GC trailing ops tests", "NoCompat", (getTestObjectProvider) => {
	const tests = (tombstoneEnabled: boolean = false) => {
		let provider: ITestObjectProvider;

		const sweepTimeoutMs = 1;
		const settings = {
			"Fluid.GarbageCollection.ThrowOnTombstoneUsage": true,
			"Fluid.GarbageCollection.TestOverride.SweepTimeoutMs": sweepTimeoutMs,
		};

		const gcOptions: IGCRuntimeOptions = { inactiveTimeoutMs: 0 };
		const configProvider = tombstoneEnabled
			? mockConfigProvider(settings)
			: mockConfigProvider();
		const tombstoneConfig: ITestContainerConfig = {
			runtimeOptions: {
				summaryOptions: {
					summaryConfigOverrides: {
						state: "disabled",
					},
				},
				gcOptions,
			},
			loaderProps: { configProvider },
		};
		const testContainerConfig: ITestContainerConfig = tombstoneEnabled
			? tombstoneConfig
			: defaultGCConfig;

		/**
		 * Submits a summary and returns the unreferenced timestamp for all the nodes in the container. If a node is
		 * referenced, the unreferenced timestamp is undefined.
		 * @returns a map of nodeId to its unreferenced timestamp.
		 */
		async function getUnreferencedTimestamps(summaryTree: ISummaryTree) {
			const gcState = getGCStateFromSummary(summaryTree);
			assert(gcState !== undefined, "GC tree is not available in the summary");
			const nodeTimestamps: Map<string, number | undefined> = new Map();
			for (const [nodeId, nodeData] of Object.entries(gcState.gcNodes)) {
				nodeTimestamps.set(nodeId.slice(1), nodeData.unreferencedTimestampMs);
			}
			return nodeTimestamps;
		}

		beforeEach(async function () {
			provider = getTestObjectProvider({ syncSummarizer: true });
		});

		it(`A summary has a datastore and blob referenced, but trailing ops unreferenced them ${
			tombstoneEnabled ? "after sweep timeout" : "before sweep timeout"
		}`, async () => {
			const mainContainer = await provider.makeTestContainer(testContainerConfig);
			const mainDefaultDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
			await waitForContainerConnection(mainContainer);

			// Create a data store and blob.
			const newDataStore =
				await mainDefaultDataStore._context.containerRuntime.createDataStore(
					TestDataObjectType,
				);
			assert(newDataStore.entryPoint !== undefined, `Should have a handle`);
			const blobContents = "Blob contents";
			const blobHandle = await mainDefaultDataStore._runtime.uploadBlob(
				stringToBuffer(blobContents, "utf-8"),
			);

			// Create a summarizer
			const { summarizer: mainSummarizer } = await createSummarizer(provider, mainContainer, {
				runtimeOptions: { gcOptions },
				loaderProps: { configProvider },
			});

			// Reference datastore and blob
			mainDefaultDataStore._root.set("datastore", newDataStore.entryPoint);
			mainDefaultDataStore._root.set("blob", blobHandle);

			// Summarize and verify that the datastore and blob are referenced
			await provider.ensureSynchronized();
			const summary1 = await summarizeNow(mainSummarizer);
			const unreferencedTimestamps1 = await getUnreferencedTimestamps(summary1.summaryTree);
			const dataStoreTimestamp1 = unreferencedTimestamps1.get(
				newDataStore.entryPoint.absolutePath.slice(1),
			);
			const blobTimestamp1 = unreferencedTimestamps1.get(blobHandle.absolutePath.slice(1));
			assert(dataStoreTimestamp1 === undefined, `Should have referenced datastore`);
			assert(blobTimestamp1 === undefined, `Should have referenced blob`);

			// Create trailing ops where the datastore and blob are unreferenced
			mainDefaultDataStore._root.delete("datastore");
			mainDefaultDataStore._root.delete("blob");
			await provider.ensureSynchronized();

			mainContainer.close();
			mainSummarizer.close();

			// Load a new container/summarizer from the summary and trailing ops
			const { summarizer } = await createSummarizer(
				provider,
				mainContainer,
				{ runtimeOptions: { gcOptions }, loaderProps: { configProvider } },
				summary1.summaryVersion,
			);

			// Ensure trailing ops are processed, summarize, and verify that the datastore and blob are unreferenced
			await provider.ensureSynchronized();
			const summary2 = await summarizeNow(summarizer);
			const unreferencedTimestamps2 = await getUnreferencedTimestamps(summary2.summaryTree);
			const dataStoreTimestamp2 = unreferencedTimestamps2.get(
				newDataStore.entryPoint.absolutePath.slice(1),
			);
			const blobTimestamp2 = unreferencedTimestamps2.get(blobHandle.absolutePath.slice(1));
			assert(dataStoreTimestamp2 !== undefined, `Should have unreferenced datastore`);
			assert(blobTimestamp2 !== undefined, `Should have unreferenced blob`);
		});

		it(`A summary has a datastore and blob unreferenced, but trailing ops referenced them ${
			tombstoneEnabled ? "after sweep timeout" : "before sweep timeout"
		}`, async () => {
			const mainContainer = await provider.makeTestContainer(testContainerConfig);
			const mainDefaultDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
			await waitForContainerConnection(mainContainer);

			// Create a data store and blob.
			const newDataStore =
				await mainDefaultDataStore._context.containerRuntime.createDataStore(
					TestDataObjectType,
				);
			assert(newDataStore.entryPoint !== undefined, `Should have a handle`);
			const blobContents = "Blob contents";
			const blobHandle = await mainDefaultDataStore._runtime.uploadBlob(
				stringToBuffer(blobContents, "utf-8"),
			);

			// Create a summarizer
			const { summarizer: mainSummarizer } = await createSummarizer(provider, mainContainer, {
				runtimeOptions: { gcOptions },
				loaderProps: { configProvider },
			});

			// Make the datastore and blob live and unreferenced
			// Note: Technically the blob is live once the blob is uploaded and the attach op is sequenced, view the BlobManager for more details.
			mainDefaultDataStore._root.set("datastore", newDataStore.entryPoint);
			mainDefaultDataStore._root.set("blob", blobHandle);
			mainDefaultDataStore._root.delete("datastore");
			mainDefaultDataStore._root.delete("blob");

			// Summarize and verify that the datastore and blob are unreferenced
			await provider.ensureSynchronized();
			const summary1 = await summarizeNow(mainSummarizer);
			const unreferencedTimestamps1 = await getUnreferencedTimestamps(summary1.summaryTree);
			const dataStoreTimestamp1 = unreferencedTimestamps1.get(
				newDataStore.entryPoint.absolutePath.slice(1),
			);
			const blobTimestamp1 = unreferencedTimestamps1.get(blobHandle.absolutePath.slice(1));
			assert(dataStoreTimestamp1 !== undefined, `Should have unreferenced datastore`);
			assert(blobTimestamp1 !== undefined, `Should have unreferenced blob`);

			// Create trailing ops where the datastore and blob are referenced
			mainDefaultDataStore._root.set("datastore", newDataStore.entryPoint);
			mainDefaultDataStore._root.set("blob", blobHandle);
			await provider.ensureSynchronized();

			mainContainer.close();
			mainSummarizer.close();

			// Load a new container/summarizer from the summary and trailing ops
			const { summarizer } = await createSummarizer(
				provider,
				mainContainer,
				{ runtimeOptions: { gcOptions }, loaderProps: { configProvider } },
				summary1.summaryVersion,
			);

			// Ensure trailing ops are processed, summarize, and verify that the datastore and blob are referenced
			await provider.ensureSynchronized();
			const summary2 = await summarizeNow(summarizer);
			const unreferencedTimestamps2 = await getUnreferencedTimestamps(summary2.summaryTree);
			const dataStoreId = newDataStore.entryPoint.absolutePath.slice(1);
			const blobId = blobHandle.absolutePath.slice(1);
			assert(unreferencedTimestamps2.has(dataStoreId), `GC should detect the datastore`);
			assert(unreferencedTimestamps2.has(blobId), `GC should detect the blob`);
			const dataStoreTimestamp2 = unreferencedTimestamps2.get(dataStoreId);
			const blobTimestamp2 = unreferencedTimestamps2.get(blobId);
			assert(dataStoreTimestamp2 === undefined, `Should have a referenced datastore`);
			assert(blobTimestamp2 === undefined, `Should have a referenced blob`);
		});
	};

	tests();
	tests(true /** tombstoneEnabled */);
});
