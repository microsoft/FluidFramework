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
	itExpects,
	TestDataObjectType,
} from "@fluid-private/test-version-utils";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { IGCRuntimeOptions } from "@fluidframework/container-runtime";
import { delay } from "@fluidframework/core-utils";
import { channelsTreeName, gcTreeKey } from "@fluidframework/runtime-definitions";
import { getGCDeletedStateFromSummary, getGCStateFromSummary } from "./gcTestSummaryUtils.js";

describeCompat("GC trailing ops tests", "NoCompat", (getTestObjectProvider) => {
	/**
	 * @param transitionToReference - Whether the trailing op should transition objects to referenced or unreferenced.
	 * @param beforeSweepTimeout - Whether the trailing op should be sent before or after sweep timeout.
	 */
	const tests = (transitionToReference: boolean, beforeSweepTimeout: boolean) => {
		let provider: ITestObjectProvider;
		let settings = {};
		let testContainerConfig: ITestContainerConfig;
		let summarizerContainerConfig: ITestContainerConfig;

		const sweepTimeoutMs = 100;
		const gcOptions: IGCRuntimeOptions = {
			inactiveTimeoutMs: 0,
			enableGCSweep: true,
			sweepGracePeriodMs: 0, // Skip Tombstone, these tests focus on Sweep
		};

		function updateDataStoreReferenceState(
			fromDataStore: ITestDataObject,
			dataStoreToUpdate: ITestDataObject,
			key: string,
			makeReferenced: boolean,
		) {
			if (makeReferenced) {
				fromDataStore._root.set(key, dataStoreToUpdate.handle);
			} else {
				fromDataStore._root.delete(key);
			}
		}

		/**
		 * Validates that the data store is not deleted from the data store and GC trees in the summary.
		 * Also, it is referenced / unreferenced as expected.
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
			provider = getTestObjectProvider({ syncSummarizer: true });
			if (provider.driver.type !== "local") {
				this.skip();
			}
			settings["Fluid.GarbageCollection.TestOverride.SweepTimeoutMs"] = sweepTimeoutMs;

			const configProvider = mockConfigProvider(settings);
			testContainerConfig = {
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

			summarizerContainerConfig = {
				runtimeOptions: { gcOptions },
				loaderProps: { configProvider },
			};
		});

		afterEach(() => {
			settings = {};
		});

		itExpects(
			`Trailing ops ${
				beforeSweepTimeout ? "before sweep timeout" : "after sweep timeout"
			} makes data store ${
				transitionToReference ? "referenced" : "unreferenced"
			} without deleting it`,
			beforeSweepTimeout && transitionToReference
				? [
						{
							eventName:
								"fluid:telemetry:Summarizer:Running:SweepReadyObject_Revived",
							clientType: "noninteractive/summarizer",
						},
				  ]
				: [],
			async () => {
				const mainContainer = await provider.makeTestContainer(testContainerConfig);
				const mainDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
				await waitForContainerConnection(mainContainer);

				const newDataStoreKey = "datastore";
				// Create a data store and reference it.
				const newDataStore =
					await mainDataStore._context.containerRuntime.createDataStore(
						TestDataObjectType,
					);
				assert(newDataStore.entryPoint !== undefined, `Should have a handle`);
				const newTestDataObject = (await newDataStore.entryPoint.get()) as ITestDataObject;
				mainDataStore._root.set(newDataStoreKey, newDataStore.entryPoint);

				// Update the reference state. The data store should start in the opposite state of "transitionToReference"
				// and the trailing op will transition it to that state.
				updateDataStoreReferenceState(
					mainDataStore,
					newTestDataObject,
					newDataStoreKey,
					!transitionToReference,
				);

				// Create a summarizer
				const { summarizer: mainSummarizer } = await createSummarizer(
					provider,
					mainContainer,
					summarizerContainerConfig,
				);

				// Summarize and verify that the datastore reference state is in the opposite state of "transitionToReference".
				await provider.ensureSynchronized();
				const summary1 = await summarizeNow(mainSummarizer);
				validateDataStoreStateInSummary(
					summary1.summaryTree,
					newDataStore.entryPoint.absolutePath,
					false /* expectGCStateHandle */,
					!transitionToReference,
				);

				// If beforeSweepTimeout is true, send the trailing op that transitions the data store to "transitionToReference"
				// state first and then wait for sweep timeout.
				// If beforeSweepTimeout is false, wait for sweep timeout and then send the trailing op.
				// In both the cases, the data store should not be deleted from the summary / GC state because the wait
				// for sweep timeout happens before GC has a chance to change the data store state.
				if (beforeSweepTimeout) {
					updateDataStoreReferenceState(
						mainDataStore,
						newTestDataObject,
						newDataStoreKey,
						transitionToReference,
					);
					await delay(sweepTimeoutMs);
				} else {
					await delay(sweepTimeoutMs);
					updateDataStoreReferenceState(
						mainDataStore,
						newTestDataObject,
						newDataStoreKey,
						transitionToReference,
					);
				}

				// Close the summarizer so that it doesn't interfere with the new one.
				mainSummarizer.close();

				// Load a new summarizer from the summary. It should process the trailing op before running GC.
				const { summarizer } = await createSummarizer(
					provider,
					mainContainer,
					summarizerContainerConfig,
					summary1.summaryVersion,
				);

				// Ensure trailing ops are processed and summarize.
				await provider.ensureSynchronized();
				const summary2 = await summarizeNow(summarizer);

				// Validate that the data store has transitioned to the correct state.
				validateDataStoreStateInSummary(
					summary2.summaryTree,
					newDataStore.entryPoint.absolutePath,
					false /* expectGCStateHandle */,
					transitionToReference,
				);

				// Summarize again to ensure that GC sweep op (if any) is now processed.
				await provider.ensureSynchronized();
				const summary3 = await summarizeNow(summarizer);

				// Validate that data store is still in the same state as before and is not deleted.
				validateDataStoreStateInSummary(
					summary3.summaryTree,
					newDataStore.entryPoint.absolutePath,
					true /* expectGCStateHandle */,
					transitionToReference,
				);
			},
		);
	};

	tests(true /* transitionToReference */, true /** beforeSweepTimeout */);
	tests(true /* transitionToReference */, false /** beforeSweepTimeout */);
	tests(false /** transitionToReference */, true /* beforeSweepTimeout */);
	tests(false /** transitionToReference */, false /* beforeSweepTimeout */);
});
