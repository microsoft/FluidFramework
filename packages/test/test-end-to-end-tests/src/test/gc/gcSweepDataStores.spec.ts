/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	ITestDataObject,
	TestDataObjectType,
	describeCompat,
	itExpects,
} from "@fluid-private/test-version-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions/internal";
import {
	ContainerMessageType,
	ContainerRuntime,
	IGCRuntimeOptions,
	IOnDemandSummarizeOptions,
	ISummarizer,
	DeletedResponseHeaderKey,
} from "@fluidframework/container-runtime/internal";
import {
	computeTombstoneTimeout,
	defaultSessionExpiryDurationMs,
	defaultSweepGracePeriodMs,
	ISweepMessage,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/container-runtime/internal/test/gc";
import {
	RetriableSummaryError,
	defaultMaxAttemptsForSubmitFailures,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/container-runtime/internal/test/summary";
import type { ISummarizeEventProps } from "@fluidframework/container-runtime-definitions/internal";
import { IErrorBase } from "@fluidframework/core-interfaces";
import { FluidErrorTypes } from "@fluidframework/core-interfaces/internal";
import { ISummaryTree, SummaryType } from "@fluidframework/driver-definitions";
import { channelsTreeName, gcTreeKey } from "@fluidframework/runtime-definitions/internal";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import {
	MockLogger,
	tagCodeArtifacts,
	TelemetryDataTag,
} from "@fluidframework/telemetry-utils/internal";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	toIDeltaManagerFull,
	createSummarizer,
	getContainerEntryPointBackCompat,
	getDataStoreEntryPointBackCompat,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";
import { SinonFakeTimers, useFakeTimers } from "sinon";

import {
	getGCDeletedStateFromSummary,
	getGCStateFromSummary,
	getGCTombstoneStateFromSummary,
	manufactureHandle,
} from "./gcTestSummaryUtils.js";

/**
 * Validates that the given data store state is correct in the summary based on expectDelete and expectGCStateHandle.
 * - The data store should or should not be present in the data store summary tree as per expectDelete.
 * - If expectGCStateHandle is true, the GC summary tree should be handle. Otherwise, the data store should or should
 * not be present in the GC summary tree as per expectDelete.
 * - The data store should or should not be present in the deleted nodes in GC summary tree as per expectDelete.
 */
function validateDataStoreStateInSummary(
	summaryTree: ISummaryTree,
	dataStoreNodePath: string,
	expectDelete: boolean,
	expectGCStateHandle: boolean,
	expectTombstoned?: true,
) {
	const shouldShouldNot = expectDelete ? "should" : "should not";

	// Check if the data store is deleted from the data store summary tree or not.
	const deletedDataStoreId = dataStoreNodePath.split("/")[1];
	const channelsTree = (summaryTree.tree[channelsTreeName] as ISummaryTree).tree;
	assert.notEqual(
		Object.keys(channelsTree).includes(deletedDataStoreId),
		expectDelete,
		`Data store ${deletedDataStoreId} ${shouldShouldNot} have been deleted from the summary`,
	);

	if (expectGCStateHandle) {
		assert.equal(
			summaryTree.tree[gcTreeKey]?.type,
			SummaryType.Handle,
			"Expecting the GC tree to be handle",
		);
		return;
	}

	// Validate that the GC state does not contain an entry for the deleted data store.
	const gcState = getGCStateFromSummary(summaryTree);
	assert(gcState !== undefined, "PRECONDITION: GC tree should be available in the summary");
	assert.notEqual(
		Object.keys(gcState.gcNodes).includes(dataStoreNodePath),
		expectDelete,
		`Data store ${dataStoreNodePath} ${shouldShouldNot} have been removed from GC state`,
	);

	if (expectTombstoned) {
		// Validate that the GC state does contain the Tombstone if expected
		const tombstones = getGCTombstoneStateFromSummary(summaryTree);
		assert(
			tombstones !== undefined,
			"PRECONDITION: GC Tombstones list should be available in the summary",
		);
		assert(
			tombstones.includes(dataStoreNodePath),
			`Data store ${dataStoreNodePath} should have been tombstoned`,
		);
	}

	// Validate that the deleted nodes in the GC data has the deleted data store.
	const deletedNodesState = getGCDeletedStateFromSummary(summaryTree);
	assert.equal(
		deletedNodesState?.includes(dataStoreNodePath) ?? false,
		expectDelete,
		`Data store ${dataStoreNodePath} ${shouldShouldNot} be in deleted nodes`,
	);
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const tombstoneTimeoutMs = computeTombstoneTimeout(defaultSessionExpiryDurationMs)!;
const sweepGracePeriodMs = defaultSweepGracePeriodMs;
const sweepTimeoutMs = tombstoneTimeoutMs + sweepGracePeriodMs;

const newGCOptions: () => IGCRuntimeOptions = () => ({
	inactiveTimeoutMs: 0,
	enableGCSweep: true,
	sweepGracePeriodMs,
});
const mockLogger = new MockLogger();
const newTestContainerConfig: () => ITestContainerConfig = () => ({
	runtimeOptions: {
		summaryOptions: {
			summaryConfigOverrides: {
				state: "disabled",
			},
		},
		gcOptions: newGCOptions(),
	},
	loaderProps: { logger: mockLogger },
});

const testContainerConfig: ITestContainerConfig = newTestContainerConfig();

let provider: ITestObjectProvider;

async function loadContainer(
	summaryVersion: string,
	config: ITestContainerConfig = testContainerConfig,
) {
	return provider.loadTestContainer(config, {
		[LoaderHeader.version]: summaryVersion,
	});
}

const loadSummarizer = async (
	container: IContainer,
	summaryVersion?: string,
	logger?: MockLogger,
) => {
	return createSummarizer(
		provider,
		container,
		{
			runtimeOptions: { gcOptions: newGCOptions() },
			forceUseCreateVersion: true, // To simulate the summarizer running on the created container
		},
		summaryVersion,
		logger,
	);
};
const ensureSynchronizedAndSummarize = async (
	summarizer: ISummarizer,
	options?: IOnDemandSummarizeOptions,
) => {
	await provider.ensureSynchronized();
	return summarizeNow(summarizer, options);
};

/**
 * Summarizes a container with a data store that is ready to be swept. It creates a container with a data store,
 * unreferences it, waits for sweep timeout, summarizes so it is sweep ready.
 * It returns the unreferenced data store id, the summarizer, the summarizing container, the summarizer's data store.
 */
async function summarizeWithSweepReadyDS(clock: SinonFakeTimers) {
	const container = await provider.makeTestContainer(testContainerConfig);
	const defaultDataObject = await getContainerEntryPointBackCompat<ITestDataObject>(container);
	await waitForContainerConnection(container);

	const handleKey = "handle";
	const dataStore =
		await defaultDataObject._context.containerRuntime.createDataStore(TestDataObjectType);
	const testDataObject = await getDataStoreEntryPointBackCompat<ITestDataObject>(dataStore);
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
	const { container: summarizingContainer1, summarizer: summarizer1 } =
		await loadSummarizer(container);
	const summaryVersion = (await ensureSynchronizedAndSummarize(summarizer1)).summaryVersion;

	// Close the container as it would be closed by session expiry before sweep ready ever occurs.
	container.close();
	// Close the summarizer so that it doesn't interfere with the new one.
	summarizingContainer1.close();

	clock.tick(sweepTimeoutMs + 10);

	// Load a new container and summarizer from the latest summary
	const { container: summarizingContainer2, summarizer: summarizer2 } = await loadSummarizer(
		container,
		summaryVersion,
	);

	const containerRuntime = (summarizer2 as any).runtime as ContainerRuntime;
	const response = await containerRuntime.resolveHandle({
		url: toFluidHandleInternal(testDataObject.handle).absolutePath,
	});
	const summarizerDataObject = response.value as ITestDataObject;

	// Send an op to update the timestamp that the summarizer client uses for GC to a current one.
	defaultDataObject._root.set("update", "timestamp");
	await provider.ensureSynchronized();

	return {
		unreferencedId,
		summarizer: summarizer2,
		summarizingContainer: summarizingContainer2,
		summarizerDataObject,
		summaryVersion,
	};
}

/**
 * These tests validate that SweepReady data stores are correctly swept. Swept datastores should be
 * removed from the summary, added to the GC deleted blob, and prevented from changing (sending / receiving ops,
 * loading, etc.).
 */
describeCompat("GC data store sweep tests", "NoCompat", function (getTestObjectProvider) {
	/**
	 * These tests use sinon fake timers to test sweep with default GC timeouts which are much larger than the
	 * default test timeout. The maximum fake time these test advances is sweepTimeoutMs. So, add sweepTimeoutMs
	 * to the test timeout to avoid test timeout errors.
	 * Specifically, these tests use `timeoutAwait` and `timeoutPromise` which fail if the fake time advances by
	 * more than the test timeout.
	 */
	const testTimeoutOverrideMs = this.timeout() + sweepTimeoutMs;
	this.timeout(testTimeoutOverrideMs);

	let clock: SinonFakeTimers;
	before(() => {
		clock = useFakeTimers({ shouldAdvanceTime: true });
	});

	beforeEach("setup", async function () {
		provider = getTestObjectProvider({ syncSummarizer: true });
		if (provider.driver.type !== "local") {
			this.skip();
		}
	});

	afterEach(() => {
		clock.reset();
		mockLogger.clear();
	});

	after(() => {
		clock.restore();
	});

	describe("Using swept data stores not allowed", () => {
		itExpects(
			"Send ops fails for swept datastores in summarizing container loaded before tombstone timeout",
			[
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_DeletingLoadedDataStore",
					clientType: "noninteractive/summarizer", // summarizeWithSweepReadyDS has a summarizer spanning before/after the delete
				},
				{
					eventName: "fluid:telemetry:FluidDataStoreContext:GC_Deleted_DataStore_Changed",
					clientType: "noninteractive/summarizer",
					callSite: "submitMessage",
				},
			],
			async () => {
				const { summarizerDataObject, summarizer } = await summarizeWithSweepReadyDS(clock);

				// The datastore should be swept now
				await ensureSynchronizedAndSummarize(summarizer);

				// Sending an op from a datastore substantiated from the request pattern should fail!
				assert.throws(
					() => summarizerDataObject._root.set("send", "op"),
					(error: IErrorBase) => {
						const correctErrorType = error.errorType === FluidErrorTypes.dataProcessingError;
						const correctErrorMessage =
							error.message?.startsWith(`Context is deleted`) === true;
						return correctErrorType && correctErrorMessage;
					},
					`Should not be able to send ops for a swept datastore.`,
				);
			},
		);

		itExpects(
			"Send signals fails for swept datastores in summarizing container loaded before tombstone timeout",
			[
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_DeletingLoadedDataStore",
					clientType: "noninteractive/summarizer", // summarizeWithSweepReadyDS has a summarizer spanning before/after the delete
				},
				{
					eventName: "fluid:telemetry:FluidDataStoreContext:GC_Deleted_DataStore_Changed",
					clientType: "noninteractive/summarizer",
					callSite: "submitSignal",
				},
			],
			async () => {
				const { summarizerDataObject, summarizer } = await summarizeWithSweepReadyDS(clock);

				// The datastore should be swept now
				await ensureSynchronizedAndSummarize(summarizer);

				// Sending a signal from a testDataObject substantiated from the request pattern should fail!
				assert.throws(
					() => summarizerDataObject._runtime.submitSignal("send", "signal"),
					(error: IErrorBase) => {
						const correctErrorType = error.errorType === FluidErrorTypes.dataProcessingError;
						const correctErrorMessage =
							error.message?.startsWith(`Context is deleted`) === true;
						return correctErrorType && correctErrorMessage;
					},
					`Should not be able to send signals for a swept datastore.`,
				);
			},
		);
	});

	describe("Using deleted data stores", () => {
		itExpects(
			"Requesting swept datastores not allowed",
			[
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_DeletingLoadedDataStore",
					clientType: "noninteractive/summarizer", // summarizeWithSweepReadyDS has a summarizer spanning before/after the delete
				},
				// DataStore
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Requested",
					clientType: "interactive",
					callSite: "getDataStore",
				},
				// Sub-DataStore
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Requested",
					clientType: "interactive",
					callSite: "getDataStore",
				},
				// Summarizer client's request logs an error
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Requested",
					clientType: "noninteractive/summarizer",
					callSite: "getDataStore",
				},
			],
			async () => {
				const { unreferencedId, summarizer } = await summarizeWithSweepReadyDS(clock);

				// The datastore should be swept now
				const { summaryVersion } = await ensureSynchronizedAndSummarize(summarizer);
				const container = await loadContainer(summaryVersion);

				mockLogger.clear();

				// This request fails since the datastore is swept
				const entryPoint = (await container.getEntryPoint()) as ITestDataObject;
				const errorResponse = await (
					entryPoint._context.containerRuntime as any
				).resolveHandle({
					url: unreferencedId,
					headers: { viaHandle: true },
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
					errorResponse.headers?.[DeletedResponseHeaderKey],
					true,
					"Expected 'deleted' header to be set on the response",
				);

				// Flush microtask queue to get PathInfo event logged
				await clock.tickAsync(0);
				mockLogger.assertMatch([
					{
						eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Requested",
						...tagCodeArtifacts({ id: `/${unreferencedId}` }),
					},
					{
						eventName: "fluid:telemetry:ContainerRuntime:GC_DeletedDataStore_PathInfo",
						...tagCodeArtifacts({
							id: `/${unreferencedId}`,
							pkg: "@fluid-example/test-dataStore",
						}),
					},
				]);

				// Request for child fails too since the datastore is swept
				const childErrorResponse = await (
					entryPoint._context.containerRuntime as any
				).resolveHandle({
					url: `${unreferencedId}/some-child-id`, // child id can be anything to test this case
					headers: { viaHandle: true },
				});
				assert.equal(
					childErrorResponse.status,
					404,
					"Should not be able to retrieve a swept datastore loading from a non-summarizer client",
				);
				assert.equal(
					childErrorResponse.value,
					`DataStore was deleted: ${unreferencedId}/some-child-id`,
					"Expected the Sweep error message",
				);
				assert.equal(
					childErrorResponse.headers?.[DeletedResponseHeaderKey],
					true,
					"Expected 'deleted' header to be set on the response",
				);

				// Flush microtask queue to get PathInfo event logged
				await clock.tickAsync(0);
				mockLogger.assertMatch([
					{
						eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Requested",
						...tagCodeArtifacts({ id: `/${unreferencedId}/some-child-id` }),
					},
					{
						eventName: "fluid:telemetry:ContainerRuntime:GC_DeletedDataStore_PathInfo",
						...tagCodeArtifacts({
							id: `/${unreferencedId}/some-child-id`,
							pkg: "@fluid-example/test-dataStore",
						}),
					},
				]);

				// This request fails since the datastore is swept
				const summarizerResponse = await (summarizer as any).runtime.resolveHandle({
					url: unreferencedId,
				});
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
					errorResponse.headers?.[DeletedResponseHeaderKey],
					true,
					"Expected 'deleted' header to be set on the response",
				);
			},
		);

		itExpects(
			"Ops for swept data stores is ignored but logs an error",
			[
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_DeletingLoadedDataStore",
					clientType: "noninteractive/summarizer", // summarizeWithSweepReadyDS has a summarizer spanning before/after the delete
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_DeletingLoadedDataStore",
					clientType: "interactive", // For this test, the interactive client is set up to receive the delete op and send ops concurrently
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Changed",
					clientType: "noninteractive/summarizer",
					callSite: "processFluidDataStoreOp",
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Changed",
					clientType: "interactive",
					callSite: "processFluidDataStoreOp",
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Changed",
					clientType: "interactive",
					callSite: "processFluidDataStoreOp",
				},
			],
			async () => {
				const {
					unreferencedId,
					summarizingContainer,
					summarizer,
					summaryVersion: unreferencedSummaryVersion,
				} = await summarizeWithSweepReadyDS(clock);
				const sendingContainer = await loadContainer(unreferencedSummaryVersion);
				const entryPoint = (await sendingContainer.getEntryPoint()) as ITestDataObject;
				const containerRuntime = entryPoint._context.containerRuntime as ContainerRuntime;
				const response = await containerRuntime.resolveHandle({
					url: unreferencedId,
				});
				const dataObject = response.value as ITestDataObject;

				// Pause incoming messages on the container that will send the op for deleted data stores.
				// Not doing this will cause the submit to fail since it will delete the data store on receiving GC op.
				await provider.opProcessingController.processIncoming(sendingContainer);

				// The datastore should be swept now
				const { summaryVersion } = await ensureSynchronizedAndSummarize(summarizer);
				const receivingContainer = await loadContainer(summaryVersion);

				// Send an op to the swept data store
				dataObject._root.set("send", "op");

				// After sending the op, resume processing so it processes the GC and above op.
				provider.opProcessingController.resumeProcessing(sendingContainer);

				// Wait for the GC and the above op to be processed which will close all the containers.
				await provider.ensureSynchronized();

				// The containers should not close
				assert(
					!sendingContainer.closed,
					"Sending container should not close on receiving an op for deleted data store",
				);
				assert(
					!summarizingContainer.closed,
					"Summarizing container should not close on receiving an op for deleted data store",
				);
				assert(
					!receivingContainer.closed,
					"Receiving container should close on receiving an op for deleted data store",
				);
			},
		);

		itExpects(
			"Signals for swept datastores are ignored but logs an error",
			[
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_DeletingLoadedDataStore",
					clientType: "noninteractive/summarizer", // summarizeWithSweepReadyDS has a summarizer spanning before/after the delete
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Changed",
					clientType: "noninteractive/summarizer",
					callSite: "processSignal",
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Changed",
					clientType: "interactive",
					callSite: "processSignal",
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_DeletingLoadedDataStore",
					clientType: "interactive", // For this test, the interactive client is set up to receive the delete op and send ops concurrently
				},
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Changed",
					clientType: "interactive",
					callSite: "processSignal",
				},
			],
			async () => {
				const {
					unreferencedId,
					summarizingContainer,
					summarizer,
					summaryVersion: unreferencedSummaryVersion,
				} = await summarizeWithSweepReadyDS(clock);
				const sendingContainer = await loadContainer(unreferencedSummaryVersion);
				const sendingDataObject = (await sendingContainer.getEntryPoint()) as ITestDataObject;
				const containerRuntime = sendingDataObject._context
					.containerRuntime as ContainerRuntime;
				const response = await containerRuntime.resolveHandle({
					url: unreferencedId,
				});
				const dataObject = response.value as ITestDataObject;

				// Pause incoming messages on the container that will send the op for deleted data stores.
				// Not doing this will cause the submit to fail since it will delete the data store on receiving GC op.
				// Also pause the inbound signals queue so that it is not processed before the GC op.
				await provider.opProcessingController.pauseProcessing(sendingContainer);
				await sendingContainer.deltaManager.inboundSignal.pause();

				// The datastore should be swept now
				const { summaryVersion } = await ensureSynchronizedAndSummarize(summarizer);
				const receivingContainer = await loadContainer(summaryVersion);

				// Send a signal to the swept data store
				dataObject._runtime.submitSignal("a", "signal");

				// Resume incoming message processing so that the delete op is processed by the sending container.
				provider.opProcessingController.resumeProcessing(sendingContainer);
				await provider.ensureSynchronized();

				// Once the GC op has been processed, resume the inbound signal queue so that the signal is processed.
				sendingContainer.deltaManager.inboundSignal.resume();

				// The containers should not close
				assert(
					!sendingContainer.closed,
					"Sending container should not close on receiving a signal for deleted data store",
				);
				assert(
					!summarizingContainer.closed,
					"Summarizing container should not close on receiving a signal for deleted data store",
				);
				assert(
					!receivingContainer.closed,
					"Receiving container should not close on receiving a signal for deleted data store",
				);
			},
		);

		it("trailing ops cause sweep ready data store to be realized by summarizer", async () => {
			const container = await provider.makeTestContainer(testContainerConfig);
			const defaultDataObject = (await container.getEntryPoint()) as ITestDataObject;
			await waitForContainerConnection(container);

			// Create a data store and make it unreferenced.
			const ds2key = "ds2";
			const dataStore =
				await defaultDataObject._context.containerRuntime.createDataStore(TestDataObjectType);
			const testDataObject =
				await getDataStoreEntryPointBackCompat<ITestDataObject>(dataStore);
			assert(
				testDataObject !== undefined,
				"Should have been able to retrieve testDataObject from entryPoint",
			);
			const unreferencedId = testDataObject._context.id;
			defaultDataObject._root.set(ds2key, testDataObject.handle);
			defaultDataObject._root.delete(ds2key);

			// Summarize so that the above data store is unreferenced.
			const { summarizer: summarizer1 } = await loadSummarizer(container);
			const { summaryVersion } = await ensureSynchronizedAndSummarize(summarizer1);
			summarizer1.close();

			// To simulate this scenario, the container that deleted the data store should send an op before its
			// session expires. At the same time, there should be a second container that receives the op whose
			// session doesn't expire by sweep timeout (this is needed for ensureSynchronized to work since it needs
			// at least one container that isn't closed).
			// So, advance the clock partially, send the op and load another container.
			const partialTimeoutMs = defaultSessionExpiryDurationMs / 2;
			clock.tick(partialTimeoutMs);
			testDataObject._root.set("key", "value");

			const container2 = await provider.loadTestContainer(testContainerConfig);
			await provider.ensureSynchronized();

			// Close the first container before its session expires so we don't get unnecessary errors.
			container.close();
			clock.tick(sweepTimeoutMs - partialTimeoutMs + 10);

			const logger = new MockLogger();
			// Summarize. The sweep ready data store should get realized because it has a
			// trailing op.
			const { summarizer: summarizer2 } = await loadSummarizer(
				container2,
				summaryVersion,
				logger,
			);
			await assert.doesNotReject(
				ensureSynchronizedAndSummarize(summarizer2),
				"summarize failed",
			);
			logger.assertMatch([
				{
					eventName: "fluid:telemetry:Summarizer:Running:SweepReadyObject_Realized",
					id: { value: `/${unreferencedId}`, tag: TelemetryDataTag.CodeArtifact },
				},
			]);
		});
	});

	describe("Deleted data stores in summary", () => {
		itExpects(
			"updates deleted data store state in the summary",
			[
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_DeletingLoadedDataStore",
					clientType: "noninteractive/summarizer", // summarizeWithSweepReadyDS has a summarizer spanning before/after the delete
				},
			],
			async () => {
				const { unreferencedId, summarizer } = await summarizeWithSweepReadyDS(clock);
				const sweepReadyDataStoreNodePath = `/${unreferencedId}`;

				// Summarize. In this summary, the gc op will be sent with the deleted data store id. The data store
				// will be removed in the subsequent summary.
				await ensureSynchronizedAndSummarize(summarizer);

				// Summarize again so that the sweep ready blobs are now deleted from the GC data.
				const summary3 = await ensureSynchronizedAndSummarize(summarizer);

				// Validate that the deleted data store's state is correct in the summary.
				validateDataStoreStateInSummary(
					summary3.summaryTree,
					sweepReadyDataStoreNodePath,
					true /* expectDelete */,
					false /* expectGCStateHandle */,
				);
			},
		);
	});

	itExpects(
		"can run sweep without failing summaries due to local changes",
		[
			{
				eventName: "fluid:telemetry:ContainerRuntime:GC_DeletingLoadedDataStore",
				clientType: "noninteractive/summarizer", // summarizeWithSweepReadyDS has a summarizer spanning before/after the delete
			},
		],
		async () => {
			const { summarizer } = await summarizeWithSweepReadyDS(clock);

			// Summarize. In this summary, the gc op will be sent with the deleted data store id. Validate that
			// the GC op does not fail summary due to local changes.
			await assert.doesNotReject(
				async () => ensureSynchronizedAndSummarize(summarizer),
				"Summary and GC should succeed in presence of GC op",
			);

			// Summarize again so that the sweep ready blobs are now deleted from the GC data. Validate that
			// summarize and GC succeed.
			await assert.doesNotReject(
				async () => ensureSynchronizedAndSummarize(summarizer),
				"Summary and GC should succeed with deleted data store",
			);
		},
	);

	describe("Sweep with summarize failures and retries", () => {
		const summarizeErrorMessage = "SimulatedTestFailure";

		/**
		 * This function does the following:
		 * 1. Overrides the summarize function of the given container runtime to fail until final summarize attempt.
		 *
		 * 2. If "blockInboundGCOp" is true, pauses the inbound queue until the final summarize attempt is completed
		 * so that the GC op is not processed until then.
		 *
		 * 3. Generates and returns a promise which resolves with ISummarizeEventProps on successful summarization.
		 */
		async function overrideSummarizeAndGetCompletionPromise(
			summarizer: ISummarizer,
			containerRuntime: ContainerRuntime,
			blockInboundGCOp: boolean = false,
		) {
			let latestAttemptProps: ISummarizeEventProps | undefined;
			const summarizePromiseP = new Promise<ISummarizeEventProps>((resolve) => {
				const handler = (eventProps: ISummarizeEventProps) => {
					latestAttemptProps = eventProps;
					if (eventProps.result !== "failure") {
						summarizer.off("summarize", handler);
						resolve(eventProps);
					} else {
						assert(
							eventProps.error?.message === summarizeErrorMessage,
							"Unexpected summarization failure",
						);
						if (eventProps.currentAttempt === eventProps.maxAttempts) {
							summarizer.off("summarize", handler);
							resolve(eventProps);
						}
					}
				};
				summarizer.on("summarize", handler);
			});

			// Pause the inbound queue so that GC ops are not processed in between failures. This will be resumed
			// before the final attempt.
			if (blockInboundGCOp) {
				await toIDeltaManagerFull(containerRuntime.deltaManager).inbound.pause();
			}

			let summarizeFunc = containerRuntime.summarize;
			const summarizeOverride = async (options: any) => {
				summarizeFunc = summarizeFunc.bind(containerRuntime);
				const results = await summarizeFunc(options);
				// If this is not the last attempt, throw an error so that summarize fails.
				if (
					latestAttemptProps === undefined ||
					latestAttemptProps.maxAttempts - latestAttemptProps.currentAttempt > 1
				) {
					throw new RetriableSummaryError(summarizeErrorMessage, 0.1);
				}
				// If this is the last attempt, resume the inbound queue to let the GC ops (if any) through.
				if (blockInboundGCOp) {
					toIDeltaManagerFull(containerRuntime.deltaManager).inbound.resume();
				}
				return results;
			};
			containerRuntime.summarize = summarizeOverride;
			return { originalSummarize: summarizeFunc, summarizePromiseP };
		}

		/**
		 * In these test, summarize fails until the final attempt but GC succeeds in each of the attempts.
		 * - In case of "multiple" gcOps, in every attempt, GC sends a sweep op with the same deleted data store.
		 * - In case of "one+" gcOps, in the first attempt, GC sends a sweep op. Depending on when this op is
		 * processed, there will be one or more GC ops for the summarization.
		 * It validates that in these scenario, the data store is correctly deleted and nothing unexpected happens.
		 */
		for (const gcOps of ["one+", "multiple"]) {
			itExpects(
				`sweep with multiple successful GC runs and [${gcOps}] GC op(s) for a single successful summarization`,
				[
					{
						eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
						clientType: "noninteractive/summarizer",
						summaryAttempts: 1,
						finalAttempt: false,
						error: summarizeErrorMessage,
					},
					{
						eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
						clientType: "noninteractive/summarizer",
						summaryAttempts: 2,
						finalAttempt: false,
						error: summarizeErrorMessage,
					},
					{
						eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
						clientType: "noninteractive/summarizer",
						summaryAttempts: 3,
						finalAttempt: false,
						error: summarizeErrorMessage,
					},
					{
						eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
						clientType: "noninteractive/summarizer",
						summaryAttempts: 4,
						finalAttempt: false,
						error: summarizeErrorMessage,
					},
					{
						eventName: "fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Requested",
						clientType: "interactive",
					},
				],
				async () => {
					const { unreferencedId, summarizer, summarizerDataObject } =
						await summarizeWithSweepReadyDS(clock);
					const sweepReadyDataStoreNodePath = `/${unreferencedId}`;

					const containerRuntime = summarizerDataObject._context
						.containerRuntime as ContainerRuntime;

					// Set up event handle to count number of GC sweep ops sent to validate that the correct number of
					// sweep ops are generated.
					let gcSweepOpCount = 0;
					containerRuntime.on("op", (op) => {
						if (op.type === ContainerMessageType.GC) {
							if ((op.contents as ISweepMessage).type === "Sweep") {
								gcSweepOpCount++;
							}
						}
					});

					// Set up summarize to fail until the final attempt.
					// If there should be multiple GC ops, pause the Inbound queue so that GC ops are not processed
					// between summarize attempts and they are sent on every GC run.
					const { originalSummarize, summarizePromiseP } =
						await overrideSummarizeAndGetCompletionPromise(
							summarizer,
							containerRuntime,
							gcOps === "multiple" /* blockInboundGCOp */,
						);

					// Summarize. There will be multiple summary attempts and in each, GC runs successfully.
					// In "one+" gcOps scenario, a GC op will be sent in first attempt and it may be processed by the
					// time next attempt starts. The data store may be deleted in this summary itself.
					// In "multiple" gcOps scenario, a GC op will be sent in every attempt and will not be processed
					// until the summary successfully completes. The data store will be deleted in the next summary.
					let summary = await summarizeNow(summarizer, {
						reason: "test",
						retryOnFailure: true,
					});

					// Validate that the summary succeeded on final attempt.
					const props = await summarizePromiseP;
					assert.equal(props.result, "success", "The summary should have been successful");
					assert.equal(
						props.currentAttempt,
						defaultMaxAttemptsForSubmitFailures,
						`The summary should have succeeded at attempt number ${defaultMaxAttemptsForSubmitFailures}`,
					);

					if (gcOps === "multiple") {
						assert.equal(gcSweepOpCount, props.currentAttempt, "Incorrect number of GC ops");
					} else {
						assert(gcSweepOpCount >= 1, "Incorrect number of GC ops");
					}

					// If the number of GC ops sent is equal to the number of summarize attempts, then the data store
					// won't be deleted in this summary. That's because the final GC run didn't know about the deletion
					// and sent a GC op.
					const expectedDeletedInFirstSummary =
						gcSweepOpCount !== defaultMaxAttemptsForSubmitFailures;

					// In "one+" gcOps scenario, the data store may or may not have been deleted depending on how many
					// ops were sent out as described above.
					// In "multiple" gcOps scenario, the data store will not be deleted yet because the inbound queue
					// was paused and GC sweep ops will be processed later.
					// The GC state will be a handle if data store is not deleted because it would not have changed
					// since last time.
					validateDataStoreStateInSummary(
						summary.summaryTree,
						sweepReadyDataStoreNodePath,
						expectedDeletedInFirstSummary /* expectDelete */,
						gcOps === "multiple" /* expectGCStateHandle */,
					);

					// Load a container from the above summary, process all ops (including any GC ops) and validate that
					// the deleted data store cannot be retrieved.
					// We load with GC Disabled to confirm that the GC Op is processed regardless of such settings
					const config_gcSweepDisabled = newTestContainerConfig();
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					config_gcSweepDisabled.runtimeOptions!.gcOptions!.enableGCSweep = undefined;
					const container2 = await loadContainer(
						summary.summaryVersion,
						config_gcSweepDisabled,
					);
					await waitForContainerConnection(container2);

					await provider.ensureSynchronized();
					const defaultDataStoreContainer2 =
						(await container2.getEntryPoint()) as ITestDataObject;
					const handle = manufactureHandle<ITestDataObject>(
						defaultDataStoreContainer2._context.IFluidHandleContext,
						sweepReadyDataStoreNodePath,
					);
					await assert.rejects(
						async () => handle.get(),
						(error: any) => {
							// (see non-exported error interface IResponseException)
							const correctErrorType = error.code === 404;
							const correctErrorMessage = (error.message as string).startsWith(
								"DataStore was deleted:",
							);
							const correctHeaders =
								error.underlyingResponseHeaders[DeletedResponseHeaderKey] === true;
							return correctErrorType && correctErrorMessage && correctHeaders;
						},
						`Should not be able to get deleted data store`,
					);

					// Revert summarize to not fail anymore.
					containerRuntime.summarize = originalSummarize;

					// Summarize again.
					summary = await summarizeNow(summarizer);

					// The data store should be deleted from the summary / GC tree.
					// The GC state will be a handle if the data store was deleted in the previous summary because it
					// would not have changed since last time.
					validateDataStoreStateInSummary(
						summary.summaryTree,
						sweepReadyDataStoreNodePath,
						true /* expectDelete */,
						expectedDeletedInFirstSummary /* expectGCStateHandle */,
					);
				},
			);
		}
	});
});
