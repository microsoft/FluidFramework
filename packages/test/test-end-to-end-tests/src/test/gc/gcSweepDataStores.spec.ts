/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	ContainerMessageType,
	ContainerRuntime,
	IGCRuntimeOptions,
	IOnDemandSummarizeOptions,
	ISummarizeEventProps,
	ISummarizer,
	TombstoneResponseHeaderKey,
} from "@fluidframework/container-runtime";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { channelsTreeName, gcTreeKey } from "@fluidframework/runtime-definitions";
import {
	ITestObjectProvider,
	createSummarizer,
	summarizeNow,
	waitForContainerConnection,
	ITestContainerConfig,
	createTestConfigProvider,
} from "@fluidframework/test-utils";
import {
	describeCompat,
	ITestDataObject,
	itExpects,
	TestDataObjectType,
} from "@fluid-private/test-version-utils";
import { delay } from "@fluidframework/core-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import { IErrorBase } from "@fluidframework/core-interfaces";
import {
	defaultMaxAttemptsForSubmitFailures,
	RetriableSummaryError,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/container-runtime/test/summary";
// eslint-disable-next-line import/no-internal-modules
import { ISweepMessage } from "@fluidframework/container-runtime/test/gc";
import {
	getGCDeletedStateFromSummary,
	getGCStateFromSummary,
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
			summaryTree.tree[gcTreeKey].type,
			SummaryType.Handle,
			"Expecting the GC tree to be handle",
		);
		return;
	}

	// Validate that the GC state does not contain an entry for the deleted data store.
	const gcState = getGCStateFromSummary(summaryTree);
	assert(gcState !== undefined, "GC tree is not available in the summary");
	assert.notEqual(
		Object.keys(gcState.gcNodes).includes(dataStoreNodePath),
		expectDelete,
		`Data store ${dataStoreNodePath} ${shouldShouldNot} have been removed from GC state`,
	);

	// Validate that the deleted nodes in the GC data has the deleted data store.
	const deletedNodesState = getGCDeletedStateFromSummary(summaryTree);
	assert.equal(
		deletedNodesState?.includes(dataStoreNodePath) ?? false,
		expectDelete,
		`Data store ${dataStoreNodePath} ${shouldShouldNot} be in deleted nodes`,
	);
}

/**
 * These tests validate that SweepReady data stores are correctly swept. Swept datastores should be
 * removed from the summary, added to the GC deleted blob, and prevented from changing (sending / receiving ops,
 * loading, etc.).
 *
 * NOTE: These tests speak of "Sweep" but simply use "tombstoneTimeoutMs" throughout, since sweepGracePeriod is set to 0.
 */
describeCompat("GC data store sweep tests", "NoCompat", (getTestObjectProvider) => {
	const tombstoneTimeoutMs = 200;
	const sweepGracePeriodMs = 0; // Skip Tombstone, these tests focus on Sweep
	const sweepTimeoutMs = tombstoneTimeoutMs + sweepGracePeriodMs;
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

	beforeEach("setup", async function () {
		provider = getTestObjectProvider({ syncSummarizer: true });
		if (provider.driver.type !== "local") {
			this.skip();
		}
		configProvider.set(
			"Fluid.GarbageCollection.TestOverride.TombstoneTimeoutMs",
			tombstoneTimeoutMs,
		);
	});

	afterEach(() => {
		configProvider.clear();
	});

	async function loadContainer(summaryVersion: string) {
		return provider.loadTestContainer(testContainerConfig, {
			[LoaderHeader.version]: summaryVersion,
		});
	}

	const loadSummarizer = async (container: IContainer, summaryVersion?: string) => {
		return createSummarizer(
			provider,
			container,
			{
				runtimeOptions: { gcOptions },
				loaderProps: { configProvider },
			},
			summaryVersion,
		);
	};
	const ensureSynchronizedAndSummarize = async (
		summarizer: ISummarizer,
		options?: IOnDemandSummarizeOptions,
	) => {
		await provider.ensureSynchronized();
		return summarizeNow(summarizer, options);
	};

	// This function creates an unreferenced datastore and returns the datastore's id and the summary version that
	// datastore was unreferenced in.
	const summarizationWithUnreferencedDataStoreAfterTime = async () => {
		const container = await provider.makeTestContainer(testContainerConfig);
		const defaultDataObject = (await container.getEntryPoint()) as ITestDataObject;
		await waitForContainerConnection(container);

		const handleKey = "handle";
		const dataStore =
			await defaultDataObject._context.containerRuntime.createDataStore(TestDataObjectType);
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
		const { container: summarizingContainer1, summarizer: summarizer1 } =
			await loadSummarizer(container);
		const summaryVersion = (await ensureSynchronizedAndSummarize(summarizer1)).summaryVersion;

		// Close the summarizer so that it doesn't interfere with the new one.
		summarizingContainer1.close();

		// Load a new container and summarizer from the latest summary
		const { container: summarizingContainer2, summarizer: summarizer2 } = await loadSummarizer(
			container,
			summaryVersion,
		);

		const containerRuntime = (summarizer2 as any).runtime as ContainerRuntime;
		const response = await containerRuntime.resolveHandle({
			url: testDataObject.handle.absolutePath,
		});
		const summarizerDataObject = response.value as ITestDataObject;
		await delay(sweepTimeoutMs + 10);

		// Send an op to update the timestamp that the summarizer client uses for GC to a current one.
		defaultDataObject._root.set("update", "timestamp");
		await provider.ensureSynchronized();

		// Close the container as it would be closed by session expiry before sweep ready ever occurs.
		container.close();

		return {
			unreferencedId,
			summarizer: summarizer2,
			summarizingContainer: summarizingContainer2,
			summarizerDataObject,
			summaryVersion,
		};
	};

	describe("Using swept data stores not allowed", () => {
		// If this test starts failing due to runtime is closed errors try first adjusting `tombstoneTimeoutMs` above
		itExpects(
			"Send ops fails for swept datastores in summarizing container loaded before tombstone timeout",
			[
				{
					eventName: "fluid:telemetry:FluidDataStoreContext:GC_Deleted_DataStore_Changed",
					clientType: "noninteractive/summarizer",
					callSite: "submitMessage",
				},
			],
			async () => {
				const { summarizerDataObject, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime();

				// The datastore should be swept now
				await ensureSynchronizedAndSummarize(summarizer);

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
			"Send signals fails for swept datastores in summarizing container loaded before tombstone timeout",
			[
				{
					eventName: "fluid:telemetry:FluidDataStoreContext:GC_Deleted_DataStore_Changed",
					clientType: "noninteractive/summarizer",
					callSite: "submitSignal",
				},
			],
			async () => {
				const { summarizerDataObject, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime();

				// The datastore should be swept now
				await ensureSynchronizedAndSummarize(summarizer);

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

	describe("Using deleted data stores", () => {
		itExpects(
			"Requesting swept datastores not allowed",
			[
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
				const { unreferencedId, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime();

				// The datastore should be swept now
				const { summaryVersion } = await ensureSynchronizedAndSummarize(summarizer);
				const container = await loadContainer(summaryVersion);

				// This request fails since the datastore is swept
				const entryPoint = (await container.getEntryPoint()) as ITestDataObject;
				const errorResponse = await (
					entryPoint._context.containerRuntime as any
				).resolveHandle({
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
					summarizerResponse.headers?.[TombstoneResponseHeaderKey],
					undefined,
					"DID NOT Expect tombstone header to be set on the response",
				);
			},
		);

		itExpects(
			"Ops for swept data stores is ignored but logs an error",
			[
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
				} = await summarizationWithUnreferencedDataStoreAfterTime();
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
				} = await summarizationWithUnreferencedDataStoreAfterTime();
				const sendingContainer = await loadContainer(unreferencedSummaryVersion);
				const sendingDataObject =
					(await sendingContainer.getEntryPoint()) as ITestDataObject;
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
	});

	describe("Deleted data stores in summary", () => {
		it("updates deleted data store state in the summary", async () => {
			const { unreferencedId, summarizer } =
				await summarizationWithUnreferencedDataStoreAfterTime();
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
		});

		it("disableDatastoreSweep true - DOES NOT update deleted data store state in the summary", async () => {
			configProvider.set("Fluid.GarbageCollection.DisableDataStoreSweep", true);

			const { unreferencedId, summarizer } =
				await summarizationWithUnreferencedDataStoreAfterTime();
			const sweepReadyDataStoreNodePath = `/${unreferencedId}`;

			// Summarize. If sweep was enabled, the gc op will be sent with the deleted data store id. The data store
			// will be removed in the subsequent summary.
			await ensureSynchronizedAndSummarize(summarizer);

			// The datastore should NOT be swept here. If sweep was enabled, it would be deleted in this summary.
			// We need to do fullTree because the GC data won't change (since it's not swept).
			// But the validation depends on the GC subtree being present (not a handle).
			const summary3 = await ensureSynchronizedAndSummarize(summarizer, {
				reason: "end-to-end test",
				fullTree: true,
			});

			// Validate that the data store's state is correct in the summary - it shouldn't have been deleted.
			validateDataStoreStateInSummary(
				summary3.summaryTree,
				sweepReadyDataStoreNodePath,
				false /* expectDelete */,
				false /* expectGCStateHandle */,
			);
		});
	});

	describe("Sweep with ValidateSummaryBeforeUpload enabled", () => {
		beforeEach("setValidateSummaryBeforeUpload", () => {
			configProvider.set("Fluid.Summarizer.ValidateSummaryBeforeUpload", true);
		});

		it("can run sweep without failing summaries due to local changes", async () => {
			const { summarizer } = await summarizationWithUnreferencedDataStoreAfterTime();

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
		});
	});

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
				await containerRuntime.deltaManager.inbound.pause();
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
					containerRuntime.deltaManager.inbound.resume();
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
						eventName:
							"fluid:telemetry:ContainerRuntime:GC_Deleted_DataStore_Requested",
						clientType: "interactive",
					},
				],
				async () => {
					const { unreferencedId, summarizer, summarizerDataObject } =
						await summarizationWithUnreferencedDataStoreAfterTime();
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
					assert.equal(
						props.result,
						"success",
						"The summary should have been successful",
					);
					assert.equal(
						props.currentAttempt,
						defaultMaxAttemptsForSubmitFailures,
						`The summary should have succeeded at attempt number ${defaultMaxAttemptsForSubmitFailures}`,
					);

					if (gcOps === "multiple") {
						assert.equal(
							gcSweepOpCount,
							props.currentAttempt,
							"Incorrect number of GC ops",
						);
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
					const container2 = await loadContainer(summary.summaryVersion);
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
							const correctErrorType = error.code === 404;
							const correctErrorMessage = error.message as string;
							return (
								correctErrorType &&
								correctErrorMessage.startsWith("DataStore was deleted:")
							);
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
