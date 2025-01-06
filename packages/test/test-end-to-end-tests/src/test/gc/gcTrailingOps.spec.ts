/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	ITestDataObject,
	TestDataObjectType,
	describeCompat,
} from "@fluid-private/test-version-utils";
import { IGCRuntimeOptions } from "@fluidframework/container-runtime/internal";
// eslint-disable-next-line import/no-internal-modules
import type { IGarbageCollectionNodeData } from "@fluidframework/container-runtime/internal/test/gc";
import { delay } from "@fluidframework/core-utils/internal";
import { ISummaryTree, SummaryType } from "@fluidframework/driver-definitions";
import { channelsTreeName, gcTreeKey } from "@fluidframework/runtime-definitions/internal";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	createSummarizer,
	createTestConfigProvider,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import { getGCDeletedStateFromSummary, getGCStateFromSummary } from "./gcTestSummaryUtils.js";

/**
 * These tests validate that trailing ops that alters the reference state of an object are successfully
 * processed by GC and doesn't result in unexpected GC issues. The tests validate the following:
 * - The reference state of objects are correctly updated in the GC run following trailing ops generation.
 * - Objects that are referenced via trailing ops are not deleted if a container is opened after sweep timeout.
 *
 * Trailing ops are ops that are not part of the latest summary of a container, i.e., they were generated
 * after the last summary was submitted. These should not be missed by GC before is runs the next time as they
 * can result in incorrect GC state or worse - incorrect deletion of objects.
 */
describeCompat("GC trailing ops tests", "NoCompat", (getTestObjectProvider) => {
	/**
	 * @param transition - The referenced state transition that the trailing op would do.
	 * @param when - Whether the trailing op should be sent before or after sweep timeout.
	 */
	const tests = (
		transition: "ref -> unref" | "unref -> ref",
		when: "beforeSweepTimeout" | "afterSweepTimeout",
	) => {
		// Skip Tombstone stage, these tests focus on Sweep
		const sweepGracePeriodMs = 0;
		const sweepTimeoutMs = 100;
		const gcOptions: IGCRuntimeOptions = {
			inactiveTimeoutMs: 0,
			enableGCSweep: true,
			sweepGracePeriodMs,
		};
		const configProvider = createTestConfigProvider();
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

		let provider: ITestObjectProvider;
		const summarizerContainerConfig: ITestContainerConfig = {
			runtimeOptions: { gcOptions },
			loaderProps: { configProvider },
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
					summaryTree.tree[gcTreeKey]?.type,
					SummaryType.Handle,
					"Expecting the GC tree to be handle",
				);
				return;
			}

			// Validate that the GC state does contains an entry for the data store.
			const gcState = getGCStateFromSummary(summaryTree);
			assert(gcState !== undefined, "GC tree is not available in the summary");
			const dataStoreGCData: IGarbageCollectionNodeData | undefined =
				gcState.gcNodes[dataStoreNodePath];
			assert(
				dataStoreGCData !== undefined,
				`Data store ${dataStoreNodePath} should be present in GC state`,
			);
			assert.equal(
				dataStoreGCData.unreferencedTimestampMs === undefined,
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

		beforeEach("getTestObjectProvider", async function () {
			provider = getTestObjectProvider({ syncSummarizer: true });
			if (provider.driver.type !== "local") {
				this.skip();
			}
			configProvider.set(
				"Fluid.GarbageCollection.TestOverride.TombstoneTimeoutMs",
				sweepTimeoutMs - sweepGracePeriodMs,
			); // sweepGracePeriodMs is 0. In any case, this subtraction represents the correct relationship between these values
		});

		afterEach(() => {
			configProvider.clear();
		});

		it(`Trailing op [${when}] transitions data store from [${transition}] without deleting it`, async () => {
			const mainContainer = await provider.makeTestContainer(testContainerConfig);
			const mainDataObject = (await mainContainer.getEntryPoint()) as ITestDataObject;
			await waitForContainerConnection(mainContainer);

			const newDataStoreKey = "datastore";
			// Create a data store and reference it.
			const newDataStore =
				await mainDataObject._context.containerRuntime.createDataStore(TestDataObjectType);
			assert(newDataStore.entryPoint !== undefined, "PRECONDITION: Should have a handle");
			const newDataObject = (await newDataStore.entryPoint.get()) as ITestDataObject;
			mainDataObject._root.set(newDataStoreKey, newDataStore.entryPoint);

			// Update the initial reference state of the data store.
			let isReferenced = transition === "ref -> unref" ? true : false;
			updateDataStoreReferenceState(
				mainDataObject,
				newDataObject,
				newDataStoreKey,
				isReferenced,
			);

			// Create a summarizer
			const { summarizer: mainSummarizer } = await createSummarizer(
				provider,
				mainContainer,
				summarizerContainerConfig,
			);

			// Summarize and verify that the datastore reference state is as per "isReferenced".
			await provider.ensureSynchronized();
			const summary1 = await summarizeNow(mainSummarizer);
			validateDataStoreStateInSummary(
				summary1.summaryTree,
				newDataStore.entryPoint.absolutePath,
				false /* expectGCStateHandle */,
				isReferenced,
			);

			// The reference state will transition now due to the trailing op sent next.
			isReferenced = !isReferenced;

			// If beforeSweepTimeout, send the trailing op that transitions the data store's reference state first
			// and then wait for sweep timeout.
			// If afterSweepTimeout, wait for sweep timeout and then send the trailing op.
			// In both the cases, the data store should not be deleted from the summary / GC state. GC processes all
			// trailing ops and recomputes the reference state before it runs, so regardless of when this op was
			// sent, GC will arrive at the right conclusion.
			if (when === "beforeSweepTimeout") {
				updateDataStoreReferenceState(
					mainDataObject,
					newDataObject,
					newDataStoreKey,
					isReferenced,
				);
				await delay(sweepTimeoutMs);
			} else if (when === "afterSweepTimeout") {
				await delay(sweepTimeoutMs);
				updateDataStoreReferenceState(
					mainDataObject,
					newDataObject,
					newDataStoreKey,
					isReferenced,
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

			// Summarize now. The trailing ops will be processed before summarize happens because summarizer connects
			// in write mode and so, all ops sequenced before its join op are processed before it connects.
			const summary2 = await summarizeNow(summarizer);

			// Validate that the data store has transitioned correctly
			validateDataStoreStateInSummary(
				summary2.summaryTree,
				newDataStore.entryPoint.absolutePath,
				false /* expectGCStateHandle */,
				isReferenced,
			);

			// Close the main container before running GC which may generate a GC op. Otherwise, it will hit this error
			// "GC_Deleted_DataStore_Unexpected_Delete". We don't expect local data stores to be deleted because
			// their session expires before deletion. This mimics that behavior.
			mainContainer.close();

			// Summarize again. This summary may generate a GC op if "sweep timeout" time has passed. However, the
			// data store will not be deleted in this summary. This is done to validate that even though trailing
			// ops that can change reference state may have been generated after sweep timeout expired, the state
			// change doesn't happen until next GC run. So, nothing can be deleted in this GC run.
			await provider.ensureSynchronized();
			const summary3 = await summarizeNow(summarizer);

			// Validate that data store is still in the same state as before and is not deleted.
			validateDataStoreStateInSummary(
				summary3.summaryTree,
				newDataStore.entryPoint.absolutePath,
				true /* expectGCStateHandle */,
				isReferenced,
			);
		});
	};

	tests("unref -> ref", "beforeSweepTimeout");
	tests("unref -> ref", "afterSweepTimeout");
	tests("ref -> unref", "beforeSweepTimeout");
	tests("ref -> unref", "afterSweepTimeout");
});
