/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	IGCRuntimeOptions,
	ISummarizer,
	TombstoneResponseHeaderKey,
} from "@fluidframework/container-runtime";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { channelsTreeName } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	ITestObjectProvider,
	createSummarizer,
	summarizeNow,
	waitForContainerConnection,
	mockConfigProvider,
	ITestContainerConfig,
} from "@fluidframework/test-utils";
import {
	describeNoCompat,
	ITestDataObject,
	itExpects,
	TestDataObjectType,
} from "@fluid-internal/test-version-utils";
import { delay } from "@fluidframework/common-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import { IErrorBase, IRequest, IResponse } from "@fluidframework/core-interfaces";
import { getGCDeletedStateFromSummary, getGCStateFromSummary } from "./gcTestSummaryUtils.js";

/**
 * These tests validate that SweepReady data stores are correctly swept. Swept datastores should be
 * removed from the summary, added to the GC deleted blob, and prevented from changing (sending / receiving ops,
 * loading, etc.).
 */
describeNoCompat("GC data store sweep tests", (getTestObjectProvider) => {
	const remainingTimeUntilSweepMs = 100;
	const sweepTimeoutMs = 200;
	assert(
		remainingTimeUntilSweepMs < sweepTimeoutMs,
		"remainingTimeUntilSweepMs should be < sweepTimeoutMs",
	);
	const settings = {};

	const gcOptions: IGCRuntimeOptions = { inactiveTimeoutMs: 0 };
	const testContainerConfig: ITestContainerConfig = {
		runtimeOptions: {
			summaryOptions: {
				summaryConfigOverrides: {
					state: "disabled",
				},
			},
			gcOptions,
		},
		loaderProps: { configProvider: mockConfigProvider(settings) },
	};

	let provider: ITestObjectProvider;

	beforeEach(async function () {
		provider = getTestObjectProvider({ syncSummarizer: true });
		if (provider.driver.type !== "local") {
			this.skip();
		}
		settings["Fluid.GarbageCollection.Test.SweepDataStores"] = true;
		settings["Fluid.GarbageCollection.RunSweep"] = true;
		settings["Fluid.GarbageCollection.TestOverride.SweepTimeoutMs"] = sweepTimeoutMs;
	});

	async function loadContainer(summaryVersion: string) {
		return provider.loadTestContainer(testContainerConfig, {
			[LoaderHeader.version]: summaryVersion,
		});
	}

	const makeContainer = async () => {
		const container = await provider.makeTestContainer(testContainerConfig);
		return container;
	};

	const loadSummarizer = async (container: IContainer, summaryVersion?: string) => {
		return createSummarizer(
			provider,
			container,
			{
				runtimeOptions: { gcOptions },
				loaderProps: { configProvider: mockConfigProvider(settings) },
			},
			summaryVersion,
		);
	};
	const summarize = async (summarizer: ISummarizer) => {
		await provider.ensureSynchronized();
		return summarizeNow(summarizer);
	};

	let opCount = 0;
	// Sends a unique op that's guaranteed to change the DDS for this specific container.
	// This can also be used to transition a client to write mode.
	const sendOpToUpdateSummaryTimestampToNow = async (container: IContainer) => {
		const defaultDataObject = await requestFluidObject<ITestDataObject>(container, "default");
		defaultDataObject._root.set("send a", `op ${opCount++}`);
	};

	// This function creates an unreferenced datastore and returns the datastore's id and the summary version that
	// datastore was unreferenced in.
	const summarizationWithUnreferencedDataStoreAfterTime = async (
		approximateUnreferenceTimestampMs: number,
	) => {
		const container = await makeContainer();
		const defaultDataObject = await requestFluidObject<ITestDataObject>(container, "default");
		await waitForContainerConnection(container);

		const handleKey = "handle";
		const dataStore = await defaultDataObject._context.containerRuntime.createDataStore(
			TestDataObjectType,
		);
		const testDataObject = (await dataStore.entryPoint?.get()) as ITestDataObject | undefined;
		assert(
			testDataObject !== undefined,
			"Should have been able to retrieve testDataObject from entryPoint",
		);
		const unreferencedId = testDataObject._context.id;

		// Reference a datastore - important for making it live
		defaultDataObject._root.set(handleKey, testDataObject.handle);
		// Unreference a datastore
		defaultDataObject._root.delete(handleKey);

		// Summarize
		const { container: summarizingContainer1, summarizer: summarizer1 } = await loadSummarizer(
			container,
		);
		const summaryVersion = (await summarize(summarizer1)).summaryVersion;

		// Close the containers as these containers would be closed by session expiry before sweep ready ever occurs
		container.close();
		summarizingContainer1.close();

		// Wait some time, the datastore can be in many different unreference states
		await delay(approximateUnreferenceTimestampMs);

		// Load a new container and summarizer based on the latest summary, summarize
		const { container: summarizingContainer2, summarizer: summarizer2 } = await loadSummarizer(
			container,
			summaryVersion,
		);

		const summarizerDataObject = await requestFluidObject<ITestDataObject>(
			summarizingContainer2,
			testDataObject.handle.absolutePath,
		);
		await sendOpToUpdateSummaryTimestampToNow(summarizingContainer2);

		return {
			unreferencedId,
			summarizer: summarizer2,
			summarizingContainer: summarizingContainer2,
			summarizerDataObject,
			summaryVersion,
		};
	};

	const setupContainerCloseErrorValidation = (container: IContainer) => {
		container.on("closed", (error) => {
			assert(error !== undefined, `Expecting an error!`);
			assert(error.message.startsWith("DataStore was deleted:"));
		});
	};

	describe("Using swept data stores not allowed", () => {
		// If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
		itExpects(
			"Send ops fails for swept datastores in summarizing container loaded before sweep timeout",
			[
				{
					eventName: "fluid:telemetry:FluidDataStoreContext:GC_Deleted_DataStore_Changed",
					clientType: "noninteractive/summarizer",
				},
			],
			async () => {
				const { summarizerDataObject, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);

				// The datastore should be swept now
				await summarize(summarizer);

				// Sending an op from a datastore substantiated from the request pattern should fail!
				assert.throws(
					() => summarizerDataObject._root.set("send", "op"),
					(error: IErrorBase) => {
						const correctErrorType = error.errorType === "dataCorruptionError";
						const correctErrorMessage =
							error.message?.startsWith(`Context is deleted`) === true;
						return correctErrorType && correctErrorMessage;
					},
					`Should not be able to send ops for a swept datastore.`,
				);
			},
		);

		itExpects(
			"Send signals fails for swept datastores in summarizing container loaded before sweep timeout",
			[
				{
					eventName: "fluid:telemetry:FluidDataStoreContext:GC_Deleted_DataStore_Changed",
					clientType: "noninteractive/summarizer",
				},
			],
			async () => {
				const { summarizerDataObject, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);

				// The datastore should be swept now
				await summarize(summarizer);

				// Sending a signal from a testDataObject substantiated from the request pattern should fail!
				assert.throws(
					() => summarizerDataObject._runtime.submitSignal("send", "signal"),
					(error: IErrorBase) => {
						const correctErrorType = error.errorType === "dataCorruptionError";
						const correctErrorMessage =
							error.message?.startsWith(`Context is deleted`) === true;
						return correctErrorType && correctErrorMessage;
					},
					`Should not be able to send signals for a swept datastore.`,
				);
			},
		);
	});

	describe("Loading swept data stores not allowed", () => {
		/**
		 * Our partners use ContainerRuntime.resolveHandle to issue requests. We can't easily call it directly,
		 * but the test containers are wired up to route requests to this function.
		 * (See the innerRequestHandler used in LocalCodeLoader for how it works)
		 */
		async function containerRuntime_resolveHandle(
			container: IContainer,
			request: IRequest,
		): Promise<IResponse> {
			return container.request(request);
		}

		// TODO: Receive ops scenarios - loaded before and loaded after (are these just context loading errors?)
		itExpects(
			"Requesting swept datastores fails in client loaded after sweep timeout and summarizing container",
			[
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Requested",
					clientType: "interactive",
				},
				// Summarizer client's request
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Requested",
					clientType: "noninteractive/summarizer",
				},
			],
			async () => {
				const { unreferencedId, summarizingContainer, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);
				await sendOpToUpdateSummaryTimestampToNow(summarizingContainer);

				// The datastore should be swept now
				const { summaryVersion } = await summarize(summarizer);
				const container = await loadContainer(summaryVersion);

				// This request fails since the datastore is swept
				const errorResponse = await containerRuntime_resolveHandle(container, {
					url: unreferencedId,
				});
				assert.equal(
					errorResponse.status,
					404,
					"Should not be able to retrieve a swept datastore loading from a non-summarizer client",
				);
				assert.equal(
					errorResponse.value,
					`DataStore was deleted: ${unreferencedId}`,
					"Expected the Sweep error message",
				);
				assert.equal(
					errorResponse.headers?.[TombstoneResponseHeaderKey],
					undefined,
					"DID NOT Expect tombstone header to be set on the response",
				);

				// This request fails since the datastore is swept
				const summarizerResponse = await containerRuntime_resolveHandle(
					summarizingContainer,
					{ url: unreferencedId },
				);
				assert.equal(
					summarizerResponse.status,
					404,
					"Should not be able to retrieve a swept datastore from a summarizer client",
				);
				assert.equal(
					summarizerResponse.value,
					`DataStore was deleted: ${unreferencedId}`,
					"Expected the Sweep error message",
				);
				assert.equal(
					summarizerResponse.headers?.[TombstoneResponseHeaderKey],
					undefined,
					"DID NOT Expect tombstone header to be set on the response",
				);
			},
		);

		itExpects(
			"Receiving ops for swept datastores fails in client after sweep timeout and summarizing container",
			[
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Requested",
					clientType: "noninteractive/summarizer",
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Requested",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					clientType: "noninteractive/summarizer",
				},
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					clientType: "interactive",
				},
			],
			async () => {
				const {
					unreferencedId,
					summarizingContainer,
					summarizer,
					summaryVersion: unreferencedSummaryVersion,
				} = await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);
				await sendOpToUpdateSummaryTimestampToNow(summarizingContainer);
				const sendingContainer = await loadContainer(unreferencedSummaryVersion);
				const response = await containerRuntime_resolveHandle(sendingContainer, {
					url: unreferencedId,
				});
				const dataObject = response.value as ITestDataObject;

				// The datastore should be swept now
				const { summaryVersion } = await summarize(summarizer);
				const container = await loadContainer(summaryVersion);
				setupContainerCloseErrorValidation(summarizingContainer);
				setupContainerCloseErrorValidation(container);

				// Send an op to the swept data store
				dataObject._root.set("send", "op");
				await provider.ensureSynchronized();

				// The containers should fail
				assert(
					summarizingContainer.closed,
					"Summarizing container with deleted datastore should close on receiving an op for it",
				);
				assert(
					container.closed,
					"Container with deleted datastore should close on receiving an op for it",
				);
			},
		);

		itExpects(
			"Receiving signals for swept datastores fails in client after sweep timeout and summarizing container",
			[
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Requested",
					clientType: "noninteractive/summarizer",
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Requested",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					clientType: "noninteractive/summarizer",
				},
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					clientType: "interactive",
				},
			],
			async () => {
				const {
					unreferencedId,
					summarizingContainer,
					summarizer,
					summaryVersion: unreferencedSummaryVersion,
				} = await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);
				await sendOpToUpdateSummaryTimestampToNow(summarizingContainer);
				const sendingContainer = await loadContainer(unreferencedSummaryVersion);
				const response = await containerRuntime_resolveHandle(sendingContainer, {
					url: unreferencedId,
				});
				const dataObject = response.value as ITestDataObject;

				// The datastore should be swept now
				const { summaryVersion } = await summarize(summarizer);
				const container = await loadContainer(summaryVersion);
				setupContainerCloseErrorValidation(summarizingContainer);
				setupContainerCloseErrorValidation(container);

				// Send an op to the swept data store
				dataObject._runtime.submitSignal("a", "signal");
				await provider.ensureSynchronized();

				// The containers should fail
				assert(
					summarizingContainer.closed,
					"Summarizing container with deleted datastore should close on receiving a signal for it",
				);
				assert(
					container.closed,
					"Container with deleted datastore should close on receiving a signal for it",
				);
			},
		);
	});

	describe("Deleted data stores in summary", () => {
		/**
		 * Validates that the given data store state is correct in the summary:
		 * - It should be deleted from the data store summary tree.
		 * - It should not be present in the GC state in GC summary tree.
		 * - It should be present in the deleted nodes in GC summary tree.
		 */
		function validateDataStoreStateInSummary(
			summaryTree: ISummaryTree,
			dataStoreNodePath: string,
		) {
			// Validate that the data store is deleted from the data store summary tree.
			const deletedDataStoreId = dataStoreNodePath.split("/")[1];
			const channelsTree = (summaryTree.tree[channelsTreeName] as ISummaryTree).tree;
			for (const [id] of Object.entries(channelsTree)) {
				if (id === deletedDataStoreId) {
					assert(false, `Data store ${id} should have been deleted from the summary`);
				}
			}

			// Validate that the GC state does not contain an entry for the deleted data store.
			const gcState = getGCStateFromSummary(summaryTree);
			assert(gcState !== undefined, "GC tree is not available in the summary");
			for (const [nodePath] of Object.entries(gcState.gcNodes)) {
				if (nodePath === dataStoreNodePath) {
					assert(false, `Data store ${nodePath} should not present be in GC state`);
				}
			}

			// Validate that the deleted nodes in the GC data has the deleted data store.
			const deletedNodesState = getGCDeletedStateFromSummary(summaryTree);
			assert(
				deletedNodesState?.includes(dataStoreNodePath),
				`Data store ${dataStoreNodePath} should be in deleted nodes`,
			);
		}

		it("updates deleted data store state in the summary", async () => {
			const { unreferencedId, summarizingContainer, summarizer } =
				await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);
			const deletedDataStoreNodePath = `/${unreferencedId}`;
			await sendOpToUpdateSummaryTimestampToNow(summarizingContainer);

			// The datastore should be swept now
			const summary2 = await summarize(summarizer);

			// Validate that the deleted data store's state is correct in the summary.
			validateDataStoreStateInSummary(summary2.summaryTree, deletedDataStoreNodePath);
		});
	});
});
