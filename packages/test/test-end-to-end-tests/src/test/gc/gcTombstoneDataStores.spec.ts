/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	AllowTombstoneRequestHeaderKey,
	ContainerRuntime,
	IGCRuntimeOptions,
	ISummarizer,
	RuntimeHeaders,
	TombstoneResponseHeaderKey,
} from "@fluidframework/container-runtime";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	ITestObjectProvider,
	createSummarizerWithContainer,
	summarizeNow,
	waitForContainerConnection,
	mockConfigProvider,
	ITestContainerConfig,
	createSummarizer,
} from "@fluidframework/test-utils";
import {
	describeNoCompat,
	ITestDataObject,
	itExpects,
	TestDataObjectType,
} from "@fluidframework/test-version-utils";
import { delay, stringToBuffer } from "@fluidframework/common-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import { IFluidHandle, IRequest, IResponse } from "@fluidframework/core-interfaces";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import { IFluidDataStoreChannel } from "@fluidframework/runtime-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { FluidSerializer, parseHandles } from "@fluidframework/shared-object-base";
import { getGCStateFromSummary, getGCTombstoneStateFromSummary } from "./gcTestSummaryUtils";

/**
 * These tests validate that SweepReady data stores are correctly marked as tombstones. Tombstones should be added
 * to the summary and changing them (sending / receiving ops, loading, etc.) is not allowed.
 */
describeNoCompat("GC data store tombstone tests", (getTestObjectProvider) => {
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
		settings["Fluid.GarbageCollection.TestOverride.SweepTimeoutMs"] = sweepTimeoutMs;
	});

	async function loadContainer(summaryVersion: string) {
		return provider.loadTestContainer(testContainerConfig, {
			[LoaderHeader.version]: summaryVersion,
		});
	}

	let documentAbsoluteUrl: string | undefined;

	const makeContainer = async () => {
		const container = await provider.makeTestContainer(testContainerConfig);
		documentAbsoluteUrl = await container.getAbsoluteUrl("");
		return container;
	};

	const loadSummarizerAndContainer = async (summaryVersion?: string) => {
		return createSummarizerWithContainer(
			provider,
			documentAbsoluteUrl,
			summaryVersion,
			gcOptions,
			mockConfigProvider(settings),
		);
	};
	const summarize = async (summarizer: ISummarizer) => {
		await provider.ensureSynchronized();
		return summarizeNow(summarizer);
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
		const { container: summarizingContainer1, summarizer: summarizer1 } =
			await loadSummarizerAndContainer();
		const summaryVersion = (await summarize(summarizer1)).summaryVersion;

		// TODO: trailing op test - note because of the way gc is currently structured, the error isn't logged,
		// but it is detected - it's stored in the pending queue and the container closes before the error is sent.
		testDataObject._root.set("send while unreferenced", "op");
		await provider.ensureSynchronized();

		// Close the containers as these containers would be closed by session expiry before sweep ready ever occurs
		container.close();
		summarizingContainer1.close();

		// Wait some time, the datastore can be in many different unreference states
		await delay(approximateUnreferenceTimestampMs);

		// Load a new container and summarizer based on the latest summary, summarize
		const { container: summarizingContainer2, summarizer: summarizer2 } =
			await loadSummarizerAndContainer(summaryVersion);

		return {
			unreferencedId,
			summarizingContainer: summarizingContainer2,
			summarizer: summarizer2,
			summaryVersion,
		};
	};

	let opCount = 0;
	// Sends a unique op that's guaranteed to change the DDS for this specific container.
	// This can also be used to transition a client to write mode.
	const sendOpToUpdateSummaryTimestampToNow = async (container: IContainer) => {
		const defaultDataObject = await requestFluidObject<ITestDataObject>(container, "default");
		defaultDataObject._root.set("send a", `op ${opCount++}`);
	};

	const getTombstonedDataObjectFromSummary = async (summaryVersion: string, id: string) => {
		// Load a container with the data store tombstoned
		const container = await loadContainer(summaryVersion);

		// Transition container to write mode
		const defaultDataObject = await requestFluidObject<ITestDataObject>(container, "default");
		defaultDataObject._root.set("send a", "op");

		// Get dataObject
		const containerRuntime = defaultDataObject._context.containerRuntime as any;
		const dataStoreContext = containerRuntime.dataStores.contexts.get(id);
		const dataStoreRuntime: IFluidDataStoreChannel = await dataStoreContext.realize();
		return (await dataStoreRuntime.entryPoint?.get()) as ITestDataObject;
	};

	const setupContainerCloseErrorValidation = (container: IContainer, expectedCall: string) => {
		container.on("closed", (error) => {
			assert(error !== undefined, `Expecting an error!`);
			assert(error.errorType === "dataCorruptionError");
			assert(error.message === `Context is tombstoned! Call site [${expectedCall}]`);
		});
	};

	describe("Using tombstone data stores not allowed (per config)", () => {
		beforeEach(() => {
			// Allow Loading but not Usage
			settings["Fluid.GarbageCollection.ThrowOnTombstoneLoad"] = false;
			settings["Fluid.GarbageCollection.ThrowOnTombstoneUsage"] = true;
		});

		// If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
		itExpects(
			"Send ops fails for tombstoned datastores in summarizing container loaded after sweep timeout",
			[{ eventName: "fluid:telemetry:FluidDataStoreContext:GC_Tombstone_DataStore_Changed" }],
			async () => {
				const { unreferencedId, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);

				// The datastore should be tombstoned now
				const { summaryVersion } = await summarize(summarizer);

				const dataObject = await getTombstonedDataObjectFromSummary(
					summaryVersion,
					unreferencedId,
				);

				// Modifying a testDataObject substantiated from the request pattern should fail!
				assert.throws(
					() => dataObject._root.set("send", "op"),
					(error) => {
						const correctErrorType = error.errorType === "dataCorruptionError";
						const correctErrorMessage =
							error.message?.startsWith(`Context is tombstoned`) === true;
						return correctErrorType && correctErrorMessage;
					},
					`Should not be able to send ops for a tombstoned datastore.`,
				);
			},
		);

		// If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
		itExpects(
			"Send ops fails for tombstoned datastores in summarizing container loaded before sweep timeout",
			[{ eventName: "fluid:telemetry:FluidDataStoreContext:GC_Tombstone_DataStore_Changed" }],
			async () => {
				const { unreferencedId, summarizingContainer, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(
						sweepTimeoutMs - remainingTimeUntilSweepMs,
					);
				// Wait enough time so that the datastore is sweep ready
				await delay(remainingTimeUntilSweepMs);

				await sendOpToUpdateSummaryTimestampToNow(summarizingContainer);

				// The datastore should be tombstoned now
				const { summaryVersion } = await summarize(summarizer);
				const dataObject = await getTombstonedDataObjectFromSummary(
					summaryVersion,
					unreferencedId,
				);

				// Sending an op from a datastore substantiated from the request pattern should fail!
				assert.throws(
					() => dataObject._root.set("send", "op"),
					(error) => {
						const correctErrorType = error.errorType === "dataCorruptionError";
						const correctErrorMessage =
							error.message?.startsWith(`Context is tombstoned`) === true;
						return correctErrorType && correctErrorMessage;
					},
					`Should not be able to send ops for a tombstoned datastore.`,
				);
			},
		);

		// If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
		itExpects(
			"Receive ops fails for tombstoned datastores in summarizing container loaded after sweep time",
			[
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:SweepReadyObject_Loaded",
				},
				{
					eventName:
						"fluid:telemetry:FluidDataStoreContext:GC_Tombstone_DataStore_Changed",
					error: "Context is tombstoned! Call site [process]",
				},
				{
					eventName:
						"fluid:telemetry:FluidDataStoreContext:GC_Tombstone_DataStore_Changed",
					error: "Context is tombstoned! Call site [process]",
				},
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					error: "Context is tombstoned! Call site [process]",
					errorType: "dataCorruptionError",
				},
				{
					eventName: "fluid:telemetry:Container:ContainerDispose",
					error: "Context is tombstoned! Call site [process]",
					errorType: "dataCorruptionError",
				},
			],
			async () => {
				const { unreferencedId, summarizer, summaryVersion, summarizingContainer } =
					await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);
				// Load this container from a summary that had not yet tombstoned the datastore so that the datastore loads.
				const container = await loadContainer(summaryVersion);
				// Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
				// production application
				// This does not cause a sweep ready changed error as the container has loaded from a summary before sweep
				// ready was set
				const senderObject = await requestFluidObject<ITestDataObject>(
					container,
					unreferencedId,
				);

				// The datastore should be tombstoned now
				const { summaryVersion: tombstoneVersion } = await summarize(summarizer);

				// Load a client from the tombstone summary
				const receivingContainer = await loadContainer(tombstoneVersion);
				await sendOpToUpdateSummaryTimestampToNow(receivingContainer);

				setupContainerCloseErrorValidation(receivingContainer, "process");

				// Receive an op - both the summarizer and the receiving client log a process error, only the receiving
				// client closes
				senderObject._root.set("send an op to be received", "op");
				await provider.ensureSynchronized();
				assert(receivingContainer.closed === true, `Reading container should close.`);
				assert(
					summarizingContainer.closed !== true,
					`Summarizing container should not close.`,
				);
			},
		);

		// If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
		itExpects(
			"Receive ops fails for tombstoned datastores in summarizing container loaded before sweep timeout",
			[
				{
					eventName:
						"fluid:telemetry:FluidDataStoreContext:GC_Tombstone_DataStore_Changed",
					error: "Context is tombstoned! Call site [process]",
				},
				{
					eventName:
						"fluid:telemetry:FluidDataStoreContext:GC_Tombstone_DataStore_Changed",
					error: "Context is tombstoned! Call site [process]",
				},
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					error: "Context is tombstoned! Call site [process]",
					errorType: "dataCorruptionError",
				},
				{
					eventName: "fluid:telemetry:Container:ContainerDispose",
					error: "Context is tombstoned! Call site [process]",
					errorType: "dataCorruptionError",
				},
			],
			async () => {
				const { unreferencedId, summarizingContainer, summarizer, summaryVersion } =
					await summarizationWithUnreferencedDataStoreAfterTime(
						sweepTimeoutMs - remainingTimeUntilSweepMs,
					);
				// Load this container from a summary that had not yet tombstoned the datastore so that the datastore loads.
				const sendingContainer = await loadContainer(summaryVersion);
				// Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
				// production application. Causes an inactiveObject loaded error
				const dataObject = await requestFluidObject<ITestDataObject>(
					sendingContainer,
					unreferencedId,
				);

				// Wait enough time so that the datastore is sweep ready
				await delay(remainingTimeUntilSweepMs);

				await sendOpToUpdateSummaryTimestampToNow(summarizingContainer);

				// The datastore should be tombstoned now
				const { summaryVersion: tombstoneVersion } = await summarize(summarizer);

				// Load a client from the tombstone summary
				const receivingContainer = await loadContainer(tombstoneVersion);
				await sendOpToUpdateSummaryTimestampToNow(receivingContainer);

				setupContainerCloseErrorValidation(receivingContainer, "process");

				// Send an op to be received - no sweep changed or loaded - the summarizing container does not log sweep
				// ready errors as it closes before the op is processed and the datastore is realized
				dataObject._root.set("send an op to be received", "op");
				await provider.ensureSynchronized();
				assert(
					receivingContainer.closed === true,
					`Container receiving messages to a tombstoned datastore should close.`,
				);
				assert(
					summarizingContainer.closed !== true,
					`Summarizing container should not close.`,
				);
			},
		);

		// If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
		itExpects(
			"Send signals fails for tombstoned datastores in summarizing container loaded after sweep timeout",
			[{ eventName: "fluid:telemetry:FluidDataStoreContext:GC_Tombstone_DataStore_Changed" }],
			async () => {
				const { unreferencedId, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);
				// The datastore should be tombstoned now
				const { summaryVersion } = await summarize(summarizer);

				const dataObject = await getTombstonedDataObjectFromSummary(
					summaryVersion,
					unreferencedId,
				);

				// Sending a signal from a testDataObject substantiated from the request pattern should fail!
				assert.throws(
					() => dataObject._runtime.submitSignal("send", "signal"),
					(error) => {
						const correctErrorType = error.errorType === "dataCorruptionError";
						const correctErrorMessage =
							error.message?.startsWith(`Context is tombstoned`) === true;
						return correctErrorType && correctErrorMessage;
					},
					`Should not be able to send signals for a tombstoned datastore.`,
				);
			},
		);

		// If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
		itExpects(
			"Receive signals fails for tombstoned datastores in summarizing container loaded after sweep timeout",
			[
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:SweepReadyObject_Loaded",
				},
				{
					eventName:
						"fluid:telemetry:FluidDataStoreContext:GC_Tombstone_DataStore_Changed",
					error: "Context is tombstoned! Call site [processSignal]",
				},
				{
					eventName:
						"fluid:telemetry:FluidDataStoreContext:GC_Tombstone_DataStore_Changed",
					error: "Context is tombstoned! Call site [processSignal]",
				},
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					error: "Context is tombstoned! Call site [processSignal]",
					errorType: "dataCorruptionError",
				},
				{
					eventName: "fluid:telemetry:Container:ContainerDispose",
					error: "Context is tombstoned! Call site [processSignal]",
					errorType: "dataCorruptionError",
				},
			],
			async () => {
				const { unreferencedId, summarizer, summaryVersion } =
					await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);
				// The datastore should be tombstoned now
				await summarize(summarizer);

				// Load this container from a summary that had not yet tombstoned the datastore so that the datastore loads.
				const container = await loadContainer(summaryVersion);
				// Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
				// production application
				// This does not cause a sweep ready changed error as the container has loaded from a summary before sweep
				// ready was set
				const senderObject = await requestFluidObject<ITestDataObject>(
					container,
					unreferencedId,
				);

				// The datastore should be tombstoned now
				const { summaryVersion: tombstoneVersion } = await summarize(summarizer);

				// Load a client from the tombstone summary
				const receivingContainer = await loadContainer(tombstoneVersion);
				await sendOpToUpdateSummaryTimestampToNow(receivingContainer);

				setupContainerCloseErrorValidation(receivingContainer, "processSignal");

				// Receive a signal by sending it from another container
				senderObject._runtime.submitSignal("send a signal to be received", "signal");
				await provider.ensureSynchronized();
				assert(
					receivingContainer.closed === true,
					`Container receiving messages to a tombstoned datastore should close.`,
				);
			},
		);
	});

	describe("Loading tombstone data stores not allowed (per config)", () => {
		const expectedHeadersLogged = {
			request: "{}",
			handleGet: JSON.stringify({ viaHandle: true }),
			request_allowTombstone: JSON.stringify({ allowTombstone: true }),
		};

		beforeEach(() => {
			// Allow Usage but not Loading
			settings["Fluid.GarbageCollection.ThrowOnTombstoneLoad"] = true;
			settings["Fluid.GarbageCollection.ThrowOnTombstoneUsage"] = false;
		});

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

		// If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
		itExpects(
			"Requesting tombstoned datastores fails in interactive client loaded after sweep timeout",
			[
				// Interactive client's request
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Tombstone_DataStore_Requested",
					headers: expectedHeadersLogged.request,
				},
				// Interactive client's request w/ allowTombstone
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Tombstone_DataStore_Requested",
					category: "generic",
					headers: expectedHeadersLogged.request_allowTombstone,
				},
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:SweepReadyObject_Loaded",
				},
				// Summarizer client's request
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Tombstone_DataStore_Requested",
					category: "generic",
					headers: expectedHeadersLogged.request,
					isSummarizerClient: true,
				},
			],
			async () => {
				const { unreferencedId, summarizingContainer, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);
				await sendOpToUpdateSummaryTimestampToNow(summarizingContainer);

				// The datastore should be tombstoned now
				const { summaryVersion } = await summarize(summarizer);
				const container = await loadContainer(summaryVersion);
				await sendOpToUpdateSummaryTimestampToNow(container);

				// This request fails since the datastore is tombstoned
				const tombstoneErrorResponse = await containerRuntime_resolveHandle(container, {
					url: unreferencedId,
				});
				assert.equal(
					tombstoneErrorResponse.status,
					404,
					"Should not be able to retrieve a tombstoned datastore in non-summarizer clients",
				);
				assert.equal(
					tombstoneErrorResponse.value,
					`DataStore was deleted: ${unreferencedId}`,
					"Expected the Tombstone error message",
				);
				assert.equal(
					tombstoneErrorResponse.headers?.[TombstoneResponseHeaderKey],
					true,
					"Expected the Tombstone header",
				);

				// This request succeeds because the "allowTombstone" header is set to true
				const tombstoneSuccessResponse = await containerRuntime_resolveHandle(container, {
					url: unreferencedId,
					headers: { [AllowTombstoneRequestHeaderKey]: true },
				});
				assert.equal(
					tombstoneSuccessResponse.status,
					200,
					"Should be able to retrieve a tombstoned datastore given the allowTombstone header",
				);
				assert.notEqual(
					tombstoneSuccessResponse.headers?.[TombstoneResponseHeaderKey],
					true,
					"DID NOT Expect tombstone header to be set on the response",
				);

				// This request succeeds because the summarizer never fails for tombstones
				const summarizerResponse = await containerRuntime_resolveHandle(
					summarizingContainer,
					{ url: unreferencedId },
				);
				assert.equal(
					summarizerResponse.status,
					200,
					"Should be able to retrieve a tombstoned datastore in summarizer clients",
				);
				assert.notEqual(
					summarizerResponse.headers?.[TombstoneResponseHeaderKey],
					true,
					"DID NOT Expect tombstone header to be set on the response",
				);
			},
		);

		// SKIPPED: This test is redundant with the previous one; SweepReady calculation/timers has coverage elsewhere
		itExpects.skip(
			"Requesting tombstoned datastores fails in summarizing container loaded before sweep timeout",
			[
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Tombstone_DataStore_Requested",
					viaHandle: false,
				},
			],
			async () => {
				const { unreferencedId, summarizingContainer, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(
						sweepTimeoutMs - remainingTimeUntilSweepMs,
					);
				// Wait enough time so that the datastore is sweep ready
				await delay(remainingTimeUntilSweepMs);

				await sendOpToUpdateSummaryTimestampToNow(summarizingContainer);

				// The datastore should be tombstoned now
				await summarize(summarizer);
				const { summaryVersion } = await summarize(summarizer);
				const container = await loadContainer(summaryVersion);
				await sendOpToUpdateSummaryTimestampToNow(container);

				// Requesting a tombstoned datastore should fail!
				await assert.rejects(
					async () => requestFluidObject<ITestDataObject>(container, unreferencedId),
					(error) => {
						const correctErrorType = error.code === 404;
						const correctErrorMessage =
							error.message === `DataStore was deleted: ${unreferencedId}`;
						return correctErrorType && correctErrorMessage;
					},
					`Should not be able to retrieve a tombstoned datastore.`,
				);
			},
		);

		// If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
		itExpects(
			"Handle request for tombstoned datastores fails in summarizing container loaded after sweep timeout",
			[
				// Interactive client's handle.get
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Tombstone_DataStore_Requested",
					headers: expectedHeadersLogged.handleGet,
				},
				// Interactive client's request w/ allowTombstone
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Tombstone_DataStore_Requested",
					category: "generic",
					headers: expectedHeadersLogged.request_allowTombstone,
				},
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:SweepReadyObject_Loaded",
				},
			],
			async () => {
				const { unreferencedId, summarizingContainer, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);
				await sendOpToUpdateSummaryTimestampToNow(summarizingContainer);

				// The datastore should be tombstoned now
				const { summaryVersion } = await summarize(summarizer);
				const dataObject = await getTombstonedDataObjectFromSummary(
					summaryVersion,
					unreferencedId,
				);

				const serializer = new FluidSerializer(
					dataObject._context.IFluidHandleContext,
					() => {},
				);
				const handle: IFluidHandle = parseHandles(
					{ type: "__fluid_handle__", url: unreferencedId },
					serializer,
				);

				// This fails because the DataStore is tombstoned
				let tombstoneError:
					| (Error & {
							code: number;
							underlyingResponseHeaders?: { [TombstoneResponseHeaderKey]: boolean };
					  })
					| undefined;
				try {
					await handle.get();
				} catch (error: any) {
					tombstoneError = error;
				}
				assert.equal(
					tombstoneError?.code,
					404,
					"Tombstone error from handle.get should have 404 status code",
				);
				assert.equal(
					tombstoneError?.message,
					`DataStore was deleted: ${unreferencedId}`,
					"Incorrect message for Tombstone error from handle.get",
				);
				assert.equal(
					tombstoneError?.underlyingResponseHeaders?.[TombstoneResponseHeaderKey],
					true,
					"Tombstone error from handle.get should include the tombstone flag",
				);

				// This demonstrates how a consumer could then fetch the tombstoned object to facilitate recovery (actual revival is covered in another test below)
				const tombstoneSuccessResponse = await (
					dataObject._context.containerRuntime as ContainerRuntime
				).resolveHandle({
					url: unreferencedId,
					headers: { [AllowTombstoneRequestHeaderKey]: true },
				});
				assert.equal(
					tombstoneSuccessResponse.status,
					200,
					"Should be able to retrieve a tombstoned datastore given the allowTombstone header",
				);
				assert.notEqual(
					tombstoneSuccessResponse.headers?.[TombstoneResponseHeaderKey],
					true,
					"DID NOT Expect tombstone header to be set on the response",
				);
			},
		);

		// SKIPPED: This test is redundant with the previous one; SweepReady calculation/timers has coverage elsewhere
		itExpects.skip(
			"Handle request for tombstoned datastores fails in summarizing container loaded before sweep timeout",
			[
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Tombstone_DataStore_Requested",
					viaHandle: true,
				},
			],
			async () => {
				const { unreferencedId, summarizingContainer, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(
						sweepTimeoutMs - remainingTimeUntilSweepMs,
					);
				// Wait enough time so that the datastore is sweep ready
				await delay(remainingTimeUntilSweepMs);

				await sendOpToUpdateSummaryTimestampToNow(summarizingContainer);

				// The datastore should be tombstoned now
				const { summaryVersion } = await summarize(summarizer);
				const dataObject = await getTombstonedDataObjectFromSummary(
					summaryVersion,
					unreferencedId,
				);

				// Note: if a user makes a request that looks like this, we will also think that the request is via handle
				const request: IRequest = {
					url: unreferencedId,
					headers: { [RuntimeHeaders.viaHandle]: true },
				};
				const response = await dataObject._context.IFluidHandleContext.resolveHandle(
					request,
				);

				assert(response !== undefined, `Expecting a response!`);
				assert(response.status === 404);
				assert(response.value === `DataStore was deleted: ${unreferencedId}`);
			},
		);

		// If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
		itExpects(
			"Can un-tombstone datastores by storing a handle",
			[
				// When confirming it's tombstoned
				{ eventName: "fluid:telemetry:ContainerRuntime:GC_Tombstone_DataStore_Requested" },
				// When reviving it
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Tombstone_DataStore_Requested",
					category: "generic",
				},
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:SweepReadyObject_Loaded",
				},
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Datastore_Revived",
					category: "generic",
				},
				{ eventName: "fluid:telemetry:Summarizer:Running:SweepReadyObject_Revived" },
			],
			async () => {
				const { unreferencedId, summarizingContainer, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(
						sweepTimeoutMs - remainingTimeUntilSweepMs,
					);
				// Wait enough time so that the datastore is sweep ready
				await delay(remainingTimeUntilSweepMs);

				await sendOpToUpdateSummaryTimestampToNow(summarizingContainer);

				// The datastore should be tombstoned now
				const { summaryVersion } = await summarize(summarizer);
				const tombstoneContainer = await loadContainer(summaryVersion);

				// Datastore should be tombstoned, requesting should error
				const tombstoneResponse = await containerRuntime_resolveHandle(tombstoneContainer, {
					url: unreferencedId,
				});
				assert.equal(tombstoneResponse.status, 404, "Expected 404 tombstone response");
				assert.equal(
					tombstoneResponse.headers?.[TombstoneResponseHeaderKey],
					true,
					"Expected tombstone response with flag",
				);

				const requestAllowingTombstone: IRequest = {
					url: unreferencedId,
					headers: { [AllowTombstoneRequestHeaderKey]: true },
				};
				const tombstonedObject = await requestFluidObject<ITestDataObject>(
					tombstoneContainer,
					requestAllowingTombstone,
				);
				const defaultDataObject = await requestFluidObject<ITestDataObject>(
					tombstoneContainer,
					"default",
				);
				defaultDataObject._root.set("store", tombstonedObject.handle);

				// The datastore should be un-tombstoned now
				const { summaryVersion: revivalVersion } = await summarize(summarizer);
				const revivalContainer = await loadContainer(revivalVersion);
				const revivedObject = await requestFluidObject<ITestDataObject>(
					revivalContainer,
					unreferencedId,
				);
				revivedObject._root.set("can send", "op");
				// This signal call closes the tombstoneContainer.
				// The op above doesn't because the signal reaches the tombstone container faster
				revivedObject._runtime.submitSignal("can submit", "signal");

				const sendingContainer = await loadContainer(revivalVersion);
				const sendDataObject = await requestFluidObject<ITestDataObject>(
					sendingContainer,
					unreferencedId,
				);
				sendDataObject._root.set("can receive", "an op");
				sendDataObject._runtime.submitSignal("can receive", "a signal");
				await provider.ensureSynchronized();
				assert(
					tombstoneContainer.closed !== true,
					`Tombstone usage allowed, so container should not close.`,
				);
				assert(
					revivalContainer.closed !== true,
					`Revived datastore should not close a container when requested, sending/receiving signals/ops.`,
				);
				assert(
					sendingContainer.closed !== true,
					`Revived datastore should not close a container when sending signals and ops.`,
				);
			},
		);
	});

	itExpects(
		"Loading/Using tombstone allowed when configured",
		[
			{ eventName: "fluid:telemetry:ContainerRuntime:GC_Tombstone_DataStore_Requested" },
			{
				eventName:
					"fluid:telemetry:ContainerRuntime:GarbageCollector:SweepReadyObject_Loaded",
			},
			{
				eventName: "fluid:telemetry:FluidDataStoreContext:GC_Tombstone_DataStore_Changed",
				callSite: "submitMessage",
			},
			{
				eventName: "fluid:telemetry:FluidDataStoreContext:GC_Tombstone_DataStore_Changed",
				callSite: "process",
				clientType: "noninteractive/summarizer",
			},
			{
				eventName: "fluid:telemetry:FluidDataStoreContext:GC_Tombstone_DataStore_Changed",
				callSite: "process",
				clientType: "interactive",
			},
		],
		async () => {
			settings["Fluid.GarbageCollection.ThrowOnTombstoneLoad"] = false;
			settings["Fluid.GarbageCollection.ThrowOnTombstoneUsage"] = false;
			const { unreferencedId, summarizingContainer, summarizer } =
				await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);
			await sendOpToUpdateSummaryTimestampToNow(summarizingContainer);

			// The datastore should be tombstoned now
			const { summaryVersion } = await summarize(summarizer);
			const container = await loadContainer(summaryVersion);
			// Requesting the tombstoned data store should succeed since ThrowOnTombstoneLoad is not enabled.
			// Logs a tombstone and sweep ready error
			let dataObject: ITestDataObject;
			await assert.doesNotReject(async () => {
				dataObject = await requestFluidObject<ITestDataObject>(container, unreferencedId);
			}, `Should be able to request a tombstoned datastore.`);
			// Modifying the tombstoned datastore should not fail since ThrowOnTombstoneUsage is not enabled.
			// Logs a submitMessage error
			assert.doesNotThrow(
				() => dataObject._root.set("send", "op"),
				`Should be able to send ops for a tombstoned datastore.`,
			);

			// Wait for the above op to be process. That will result in another error logged during process.
			// Both the summarizing container and the submitting container log a process error
			await provider.ensureSynchronized();
		},
	);

	describe("Tombstone information in summary", () => {
		/**
		 * Validates that the give summary tree contains correct information in the tombstone blob in GC tree.
		 * @param summaryTree - The summary tree that may contain the tombstone blob.
		 * @param tombstones - A list of ids that should be present in the tombstone blob.
		 * @param notTombstones - A list of ids that should not be present in the tombstone blob.
		 */
		function validateTombstoneState(
			summaryTree: ISummaryTree,
			tombstones: string[] | undefined,
			notTombstones: string[],
		) {
			const actualTombstones = getGCTombstoneStateFromSummary(summaryTree);
			if (tombstones === undefined) {
				assert(
					actualTombstones === undefined,
					"GC tree should not have tombstones in summary",
				);
				return;
			}
			assert(actualTombstones !== undefined, "GC tree should have tombstones in summary");
			for (const url of tombstones) {
				assert(actualTombstones.includes(url), `${url} should be in tombstone blob`);
			}
			for (const url of notTombstones) {
				assert(!actualTombstones.includes(url), `${url} should not be in tombstone blob`);
			}
		}

		beforeEach(() => {
			// This is not the typical configuration we expect (usage may be allowed), but keeping it more strict for the tests
			settings["Fluid.GarbageCollection.ThrowOnTombstoneLoad"] = true;
			settings["Fluid.GarbageCollection.ThrowOnTombstoneUsage"] = true;
		});

		it("adds tombstone data stores information to tombstone blob in summary", async () => {
			const mainContainer = await provider.makeTestContainer(testContainerConfig);
			const mainDataStore = await requestFluidObject<ITestDataObject>(
				mainContainer,
				"default",
			);
			const mainDataStoreUrl = `/${mainDataStore._context.id}`;
			await waitForContainerConnection(mainContainer);

			const summarizer = await createSummarizer(
				provider,
				mainContainer,
				undefined /* summaryVersion */,
				gcOptions,
				mockConfigProvider(settings),
			);

			// Create couple of data stores.
			const newDataStore = await requestFluidObject<ITestDataObject>(
				await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType),
				"",
			);
			const newDataStore2 = await requestFluidObject<ITestDataObject>(
				await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType),
				"",
			);
			const newDataStoreUrl = `/${newDataStore._context.id}`;
			const newDataStore2Url = `/${newDataStore2._context.id}`;

			// Add the data stores' handle so that they are live and referenced.
			mainDataStore._root.set("newDataStore", newDataStore.handle);
			mainDataStore._root.set("newDataStore2", newDataStore2.handle);

			// Remove the data stores' handle to make them unreferenced.
			mainDataStore._root.delete("newDataStore");
			mainDataStore._root.delete("newDataStore2");

			// Summarize so that the above data stores are marked unreferenced.
			await provider.ensureSynchronized();
			const summary = await summarizeNow(summarizer);
			validateTombstoneState(summary.summaryTree, undefined /* tombstones */, []);

			// Wait for sweep timeout so that the data stores are tombstoned.
			await delay(sweepTimeoutMs + 10);
			// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
			mainDataStore._root.set("key", "value");
			await provider.ensureSynchronized();

			// Summarize. The tombstoned data stores should now be part of the summary.
			const summary2 = await summarizeNow(summarizer);
			validateTombstoneState(
				summary2.summaryTree,
				[newDataStoreUrl, newDataStore2Url],
				[mainDataStoreUrl],
			);
		});

		it("adds tombstone attachment blob information to tombstone blob in summary", async () => {
			const mainContainer = await provider.makeTestContainer(testContainerConfig);
			const mainDataStore = await requestFluidObject<ITestDataObject>(
				mainContainer,
				"default",
			);
			const mainDataStoreUrl = `/${mainDataStore._context.id}`;
			await waitForContainerConnection(mainContainer);

			const summarizer = await createSummarizer(
				provider,
				mainContainer,
				undefined /* summaryVersion */,
				gcOptions,
				mockConfigProvider(settings),
			);

			// Upload an attachment blobs and mark it referenced.
			const blobContents = "Blob contents";
			const blobHandle = await mainDataStore._context.uploadBlob(
				stringToBuffer(blobContents, "utf-8"),
			);
			mainDataStore._root.set("blob", blobHandle);

			// Remove the blob's handle to make it unreferenced.
			mainDataStore._root.delete("blob");

			// Summarize so that the above attachment blob is marked unreferenced.
			await provider.ensureSynchronized();
			const summary = await summarizeNow(summarizer);
			validateTombstoneState(summary.summaryTree, undefined /* tombstones */, []);

			// Wait for sweep timeout so that the blob is tombstoned.
			await delay(sweepTimeoutMs + 10);
			// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
			mainDataStore._root.set("key", "value");
			await provider.ensureSynchronized();

			// Summarize. The tombstoned attachment blob should now be part of the tombstone blob.
			const summary2 = await summarizeNow(summarizer);
			validateTombstoneState(
				summary2.summaryTree,
				[blobHandle.absolutePath],
				[mainDataStoreUrl],
			);
		});

		itExpects(
			"removes un-tombstoned data store and attachment blob from tombstone blob in summary",
			[
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Datastore_Revived",
					category: "generic",
				},
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Revived",
					category: "generic",
				},
				{
					eventName: "fluid:telemetry:Summarizer:Running:SweepReadyObject_Revived",
					type: "DataStore",
				},
				{
					eventName: "fluid:telemetry:Summarizer:Running:SweepReadyObject_Revived",
					type: "Blob",
				},
			],
			async () => {
				const mainContainer = await provider.makeTestContainer(testContainerConfig);
				const mainDataStore = await requestFluidObject<ITestDataObject>(
					mainContainer,
					"default",
				);
				const mainDataStoreUrl = `/${mainDataStore._context.id}`;
				await waitForContainerConnection(mainContainer);

				const mockLogger = new MockLogger();

				const summarizer = await createSummarizer(
					provider,
					mainContainer,
					undefined /* summaryVersion */,
					gcOptions,
					mockConfigProvider(settings),
					mockLogger,
				);

				// Create couple of data stores.
				const newDataStore = await requestFluidObject<ITestDataObject>(
					await mainDataStore._context.containerRuntime.createDataStore(
						TestDataObjectType,
					),
					"",
				);
				const newDataStore2 = await requestFluidObject<ITestDataObject>(
					await mainDataStore._context.containerRuntime.createDataStore(
						TestDataObjectType,
					),
					"",
				);
				const newDataStoreUrl = `/${newDataStore._context.id}`;
				const newDataStore2Url = `/${newDataStore2._context.id}`;

				// Add the data stores' handles so that they are live and referenced.
				mainDataStore._root.set("newDataStore", newDataStore.handle);
				mainDataStore._root.set("newDataStore2", newDataStore2.handle);

				// Remove the data stores' handles to make them unreferenced.
				mainDataStore._root.delete("newDataStore");
				mainDataStore._root.delete("newDataStore2");

				// Upload an attachment blob and mark it referenced.
				const blobContents = "Blob contents";
				const blobHandle = await mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);
				mainDataStore._root.set("blob", blobHandle);

				// Remove the blob's handle to make it unreferenced.
				mainDataStore._root.delete("blob");

				// Summarize so that the above data stores and blobs are marked unreferenced.
				await provider.ensureSynchronized();
				const summary = await summarizeNow(summarizer);
				validateTombstoneState(summary.summaryTree, undefined /* tombstones */, []);

				// Wait for sweep timeout so that the data stores are tombstoned.
				await delay(sweepTimeoutMs + 10);
				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize. The tombstoned data stores should now be part of the tombstone blob.
				const summary2 = await summarizeNow(summarizer);
				validateTombstoneState(
					summary2.summaryTree,
					[newDataStoreUrl, newDataStore2Url, blobHandle.absolutePath],
					[mainDataStoreUrl],
				);

				mockLogger.assertMatchNone([
					{
						eventName:
							"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Datastore_Revived",
					},
					{
						eventName:
							"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Revived",
					},
				]);

				// Mark one of the data stores and attachment blob as referenced so that they are not tombstones anymore.
				// Note that sweepTimeout was shrunk below sessionExpiry, otherwise we'd need to load a new container and
				// use the allowTombstone header to even get the handle and revive these.
				mainDataStore._root.set("newDataStore", newDataStore.handle);
				mainDataStore._root.set("blob", blobHandle);
				await provider.ensureSynchronized();
				mockLogger.assertMatch([
					{
						eventName:
							"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Datastore_Revived",
					},
					{
						eventName:
							"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Revived",
					},
				]);

				// Summarize. The un-tombstoned data store and attachment blob should not be part of the tombstone blob.
				const summary3 = await summarizeNow(summarizer);
				validateTombstoneState(
					summary3.summaryTree,
					[newDataStore2Url],
					[mainDataStoreUrl, newDataStoreUrl, blobHandle.absolutePath],
				);
			},
		);

		it("does not re-summarize GC state on only tombstone state changed", async () => {
			const mainContainer = await provider.makeTestContainer(testContainerConfig);
			const mainDataStore = await requestFluidObject<ITestDataObject>(
				mainContainer,
				"default",
			);
			await waitForContainerConnection(mainContainer);

			const summarizer = await createSummarizer(
				provider,
				mainContainer,
				undefined /* summaryVersion */,
				gcOptions,
				mockConfigProvider(settings),
			);

			// Create a data store.
			const newDataStore = await requestFluidObject<ITestDataObject>(
				await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType),
				"",
			);

			// Add the data store's handle so that it is live and referenced.
			mainDataStore._root.set("newDataStore", newDataStore.handle);

			// Remove the data store's handle to make it unreferenced.
			mainDataStore._root.delete("newDataStore");

			// Summarize so that the above data stores are marked unreferenced.
			await provider.ensureSynchronized();
			const summary = await summarizeNow(summarizer);
			const gcState = getGCStateFromSummary(summary.summaryTree);
			assert(
				gcState !== undefined,
				"GC state should be available and should not be a handle",
			);

			// Wait for sweep timeout so that the data stores are tombstoned.
			await delay(sweepTimeoutMs + 10);
			// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
			mainDataStore._root.set("key", "value");
			await provider.ensureSynchronized();

			// Summarize. The tombstoned data stores should now be part of the summary.
			const summary2 = await summarizeNow(summarizer);
			assert.throws(
				() => getGCStateFromSummary(summary2.summaryTree),
				(e) => validateAssertionError(e, "GC state is not a blob"),
			);
			const tombstoneState = getGCTombstoneStateFromSummary(summary2.summaryTree);
			assert(
				tombstoneState !== undefined,
				"Tombstone state should be available and should be a blob",
			);

			// Summarize. The tombstoned state should be a handle.
			const summary3 = await summarizeNow(summarizer);
			assert.throws(
				() => getGCTombstoneStateFromSummary(summary3.summaryTree),
				(e) => validateAssertionError(e, "GC data should be a tree"),
			);
		});

		itExpects(
			"can mark data store from tombstone information in summary in non-summarizer container",
			[
				{
					eventName: "fluid:telemetry:ContainerRuntime:GC_Tombstone_DataStore_Requested",
				},
			],
			async () => {
				const mainContainer = await provider.makeTestContainer(testContainerConfig);
				const mainDataStore = await requestFluidObject<ITestDataObject>(
					mainContainer,
					"default",
				);
				const mainDataStoreUrl = `/${mainDataStore._context.id}`;
				await waitForContainerConnection(mainContainer);

				const summarizer = await createSummarizer(
					provider,
					mainContainer,
					undefined /* summaryVersion */,
					gcOptions,
					mockConfigProvider(settings),
				);

				// Create a data store and mark it referenced.
				const newDataStore = await requestFluidObject<ITestDataObject>(
					await mainDataStore._context.containerRuntime.createDataStore(
						TestDataObjectType,
					),
					"",
				);
				const newDataStoreUrl = `/${newDataStore._context.id}`;
				mainDataStore._root.set("newDataStore", newDataStore.handle);

				// Remove the data store's handle to make it unreferenced.
				mainDataStore._root.delete("newDataStore");

				// Summarize so that the above data stores are marked unreferenced.
				await provider.ensureSynchronized();
				const summary = await summarizeNow(summarizer);
				validateTombstoneState(summary.summaryTree, undefined /* tombstones */, []);

				// Wait for sweep timeout so that the data stores are tombstoned.
				await delay(sweepTimeoutMs + 10);
				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize. The tombstoned data stores should now be part of the summary.
				const summary2 = await summarizeNow(summarizer);
				validateTombstoneState(summary2.summaryTree, [newDataStoreUrl], [mainDataStoreUrl]);

				// Load a container from the above summary. The tombstoned data store should be correctly marked.
				const container2 = await loadContainer(summary2.summaryVersion);

				// Requesting the tombstoned data store should result in an error.
				const unreferencedId = newDataStore._context.id;
				await assert.rejects(
					async () => requestFluidObject<ITestDataObject>(container2, unreferencedId),
					(error) => {
						const correctErrorType = error.code === 404;
						const correctErrorMessage =
							error.message === `DataStore was deleted: ${unreferencedId}`;
						return correctErrorType && correctErrorMessage;
					},
					`Should not be able to retrieve a tombstoned datastore.`,
				);
			},
		);
	});
});
