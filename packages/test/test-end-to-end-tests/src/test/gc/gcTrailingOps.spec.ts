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
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { IGCRuntimeOptions } from "@fluidframework/container-runtime";
import { delay } from "@fluidframework/core-utils";
import { channelsTreeName, gcTreeKey } from "@fluidframework/runtime-definitions";
import { getGCDeletedStateFromSummary, getGCStateFromSummary } from "./gcTestSummaryUtils.js";

describeCompat("GC trailing ops tests", "NoCompat", (getTestObjectProvider) => {
	const tests = (enableGCSweep?: true) => {
		let provider: ITestObjectProvider;
		let settings = {};

		const sweepTimeoutMs = 100;
		const configProvider = mockConfigProvider(settings);
		const gcOptions: IGCRuntimeOptions = { inactiveTimeoutMs: 0, enableGCSweep };
		const testContainerConfig: ITestContainerConfig = {
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

		/**
		 * Validates that the data store is not deleted from the data store and GC trees in the summary.
		 */
		function validateDataStoreStateInSummary(
			summaryTree: ISummaryTree,
			dataStoreNodePath: string,
			expectGCStateHandle: boolean,
			referenced: boolean,
		) {
			// Validate that the data store is not deleted from the data store summary tree.
			const dataStoreId = dataStoreNodePath.split("/")[1];
			const channelsTree = (summaryTree.tree[channelsTreeName] as ISummaryTree).tree;
			assert.equal(
				Object.keys(channelsTree).includes(dataStoreId),
				true,
				`Data store ${dataStoreId} should not have been deleted from the summary`,
			);

			// If expecting the GC state to be a handle, validate that and return.
			if (expectGCStateHandle) {
				assert.equal(
					summaryTree.tree[gcTreeKey].type,
					SummaryType.Handle,
					"Expecting the GC tree to be handle",
				);
				return;
			}

			// Validate that the GC state does contains an entry for the data store.
			const gcState = getGCStateFromSummary(summaryTree);
			assert(gcState !== undefined, "GC tree is not available in the summary");
			const dataStoreGCData = gcState.gcNodes[dataStoreNodePath];
			assert(
				dataStoreGCData !== undefined,
				`Data store ${dataStoreNodePath} should be present in GC state`,
			);
			assert.equal(
				dataStoreGCData.unreferencedTimestampMs ? false : true,
				referenced,
				`Data store ${dataStoreNodePath}'s referenced state is incorrect`,
			);

			// Validate that the deleted nodes in the GC data does not have the data store.
			const deletedNodesState = getGCDeletedStateFromSummary(summaryTree);
			assert.equal(
				deletedNodesState?.includes(dataStoreNodePath) ?? false,
				false,
				`Data store ${dataStoreNodePath} should not be in deleted nodes`,
			);
		}

		beforeEach(async function () {
			settings = {};
			provider = getTestObjectProvider({ syncSummarizer: true });
			if (provider.driver.type !== "local") {
				this.skip();
			}

			if (enableGCSweep) {
				settings["Fluid.GarbageCollection.TestOverride.SweepTimeoutMs"] = sweepTimeoutMs;
			}
		});

		it(`Trailing ops ${
			enableGCSweep ? "after sweep timeout" : "before sweep timeout"
		} makes data store unreferenced without deleting it`, async () => {
			const mainContainer = await provider.makeTestContainer(testContainerConfig);
			const mainDefaultDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
			await waitForContainerConnection(mainContainer);

			// Create a data store and reference it.
			const newDataStore =
				await mainDefaultDataStore._context.containerRuntime.createDataStore(
					TestDataObjectType,
				);
			assert(newDataStore.entryPoint !== undefined, `Should have a handle`);
			mainDefaultDataStore._root.set("datastore", newDataStore.entryPoint);

			// Create a summarizer
			const { summarizer: mainSummarizer } = await createSummarizer(provider, mainContainer, {
				runtimeOptions: { gcOptions },
				loaderProps: { configProvider },
			});

			// Summarize and verify that the datastore is referenced.
			await provider.ensureSynchronized();
			const summary1 = await summarizeNow(mainSummarizer);
			validateDataStoreStateInSummary(
				summary1.summaryTree,
				newDataStore.entryPoint.absolutePath,
				false /* expectGCStateHandle */,
				true /* referenced */,
			);

			// If sweep is enabled, send the trailing op that makes data store unreferenced after waiting
			// for sweep timeout.
			// If sweep is disabled, send the trailing op right away.
			// In both the cases, the data store should be unreferenced but not deleted in the next summary.
			if (enableGCSweep) {
				await delay(sweepTimeoutMs);
			}
			mainDefaultDataStore._root.delete("datastore");

			// Close the summarizer so that it doesn't interfere with the new one.
			mainSummarizer.close();

			// Load a new summarizer from the summary. It should process the trailing op before running GC.
			const { summarizer } = await createSummarizer(
				provider,
				mainContainer,
				{ runtimeOptions: { gcOptions }, loaderProps: { configProvider } },
				summary1.summaryVersion,
			);

			// If sweep is not enabled, wait for sweep timeout before running GC to ensure that the data store
			// is not deleted in that run.
			if (!enableGCSweep) {
				await delay(sweepTimeoutMs);
			}

			// Ensure trailing ops are processed and summarize.
			await provider.ensureSynchronized();
			const summary2 = await summarizeNow(summarizer);

			// Validate that data store is unreferenced but not deleted.
			validateDataStoreStateInSummary(
				summary2.summaryTree,
				newDataStore.entryPoint.absolutePath,
				false /* expectGCStateHandle */,
				false /* referenced */,
			);

			// Summarize again to ensure that GC sweep op (if any) is now processed.
			await provider.ensureSynchronized();
			const summary3 = await summarizeNow(summarizer);

			// Validate that data store is still unreferenced but not deleted. The GC state should not be a handle
			// since it should not have changed since last time.
			validateDataStoreStateInSummary(
				summary3.summaryTree,
				newDataStore.entryPoint.absolutePath,
				true /* expectGCStateHandle */,
				false /* referenced */,
			);
		});

		it(`Trailing ops ${
			enableGCSweep ? "after sweep timeout" : "before sweep timeout"
		} makes data store referenced without deleting it`, async () => {
			const mainContainer = await provider.makeTestContainer(testContainerConfig);
			const mainDefaultDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
			await waitForContainerConnection(mainContainer);

			// Create a data store and make it unreferenced.
			const newDataStore =
				await mainDefaultDataStore._context.containerRuntime.createDataStore(
					TestDataObjectType,
				);
			assert(newDataStore.entryPoint !== undefined, `Should have a handle`);
			mainDefaultDataStore._root.set("datastore", newDataStore.entryPoint);
			mainDefaultDataStore._root.delete("datastore");

			// Create a summarizer
			const { summarizer: mainSummarizer } = await createSummarizer(provider, mainContainer, {
				runtimeOptions: { gcOptions },
				loaderProps: { configProvider },
			});

			// Summarize and verify that the datastore is unreferenced.
			await provider.ensureSynchronized();
			const summary1 = await summarizeNow(mainSummarizer);
			validateDataStoreStateInSummary(
				summary1.summaryTree,
				newDataStore.entryPoint.absolutePath,
				false /* expectGCStateHandle */,
				false /* referenced */,
			);

			// If sweep is enabled, send the trailing op that makes data store referenced after waiting
			// for sweep timeout.
			// If sweep is disabled, send the trailing op right away.
			// In both the cases, the data store should be referenced and not deleted in the next summary.
			if (enableGCSweep) {
				await delay(sweepTimeoutMs);
			}
			mainDefaultDataStore._root.set("datastore", newDataStore.entryPoint);

			// Close the summarizer so that it doesn't interfere with the new one.
			mainSummarizer.close();

			// Load a new summarizer from the summary.
			const { summarizer } = await createSummarizer(
				provider,
				mainContainer,
				{ runtimeOptions: { gcOptions }, loaderProps: { configProvider } },
				summary1.summaryVersion,
			);

			// If sweep is not enabled, wait for sweep timeout before running GC to ensure that the data store
			// is not deleted in that run.
			if (!enableGCSweep) {
				await delay(sweepTimeoutMs);
			}

			// Ensure trailing ops are processed and summarize.
			await provider.ensureSynchronized();
			const summary2 = await summarizeNow(summarizer);

			// Validate that data store is referenced and not deleted.
			validateDataStoreStateInSummary(
				summary2.summaryTree,
				newDataStore.entryPoint.absolutePath,
				false /* expectGCStateHandle */,
				true /* referenced */,
			);

			// Summarize again to ensure that GC sweep op (if any) is now processed.
			await provider.ensureSynchronized();
			const summary3 = await summarizeNow(summarizer);

			// Validate that data store is still referenced and not deleted. The GC state should not be a handle
			// since it should not have changed since last time.
			validateDataStoreStateInSummary(
				summary3.summaryTree,
				newDataStore.entryPoint.absolutePath,
				true /* expectGCStateHandle */,
				true /* referenced */,
			);
		});
	};

	tests();
	tests(true /** sweepEnabled */);
});
