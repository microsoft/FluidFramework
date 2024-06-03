/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import {
	ITestDataObject,
	TestDataObjectType,
	describeCompat,
	itExpects,
} from "@fluid-private/test-version-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions/internal";
import {
	AllowTombstoneRequestHeaderKey,
	ContainerRuntime,
	IOnDemandSummarizeOptions,
	ISummarizer,
	TombstoneResponseHeaderKey,
} from "@fluidframework/container-runtime/internal";
import {
	IErrorBase,
	IFluidHandle,
	IRequest,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import type { IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import { delay } from "@fluidframework/core-utils/internal";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import type { ISharedMap } from "@fluidframework/map/internal";
import {
	IFluidDataStoreChannel,
	IGarbageCollectionDetailsBase,
} from "@fluidframework/runtime-definitions/internal";
import { responseToException } from "@fluidframework/runtime-utils/internal";
import { FluidSerializer, parseHandles } from "@fluidframework/shared-object-base/internal";
import { MockLogger, TelemetryDataTag } from "@fluidframework/telemetry-utils/internal";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	createSummarizer,
	createTestConfigProvider,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import {
	getGCStateFromSummary,
	getGCTombstoneStateFromSummary,
	manufactureHandle,
} from "./gcTestSummaryUtils.js";

type ExpectedTombstoneError = Error & {
	code: number;
	underlyingResponseHeaders?: { [TombstoneResponseHeaderKey]: boolean };
};

/**
 * These tests validate that TombstoneReady data stores are correctly marked as tombstones. Tombstones should be added
 * to the summary and changing them (sending / receiving ops, loading, etc.) is not allowed.
 */
describeCompat("GC data store tombstone tests", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedMap } = apis.dds;
	const remainingTimeUntilSweepMs = 100;
	const tombstoneTimeoutMs = 200;
	assert(
		remainingTimeUntilSweepMs < tombstoneTimeoutMs,
		"remainingTimeUntilSweepMs should be < tombstoneTimeoutMs",
	);

	const configProvider = createTestConfigProvider();
	const testContainerConfig: ITestContainerConfig = {
		runtimeOptions: {
			gcOptions: { enableGCSweep: true, inactiveTimeoutMs: 0 },
		},
		loaderProps: { configProvider },
	};
	const testContainerConfigWithFutureGCGenerationOption: ITestContainerConfig = {
		runtimeOptions: {
			summaryOptions: testContainerConfig.runtimeOptions?.summaryOptions,
			gcOptions: {
				...testContainerConfig.runtimeOptions?.gcOptions,
				// Different from undefined (the persisted value) so will disable GC enforcement
				gcGeneration: 2,
			},
		},
		loaderProps: testContainerConfig.loaderProps,
	};

	const summarizerTestConfig: ITestContainerConfig = {
		...testContainerConfig,
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

	async function loadContainer(
		summaryVersion: string,
		disableTombstoneFailureViaGCGenerationOption: boolean = false,
		logger?: ITelemetryBaseLogger,
	) {
		const config = disableTombstoneFailureViaGCGenerationOption
			? testContainerConfigWithFutureGCGenerationOption
			: testContainerConfig;
		const config2: ITestContainerConfig = {
			...config,
			loaderProps: {
				...config.loaderProps,
				logger,
			},
		};
		return provider.loadTestContainer(config2, {
			[LoaderHeader.version]: summaryVersion,
		});
	}

	const makeContainer = async (config: ITestContainerConfig = testContainerConfig) => {
		return provider.makeTestContainer(config);
	};

	const loadSummarizer = async (
		container: IContainer,
		summaryVersion?: string,
		logger?: MockLogger,
	) => {
		return createSummarizer(provider, container, summarizerTestConfig, summaryVersion, logger);
	};
	const summarize = async (summarizer: ISummarizer, options?: IOnDemandSummarizeOptions) => {
		await provider.ensureSynchronized();
		return summarizeNow(summarizer, options);
	};

	// This function creates an unreferenced datastore and returns the datastore's id and the summary version that
	// datastore was unreferenced in.
	const summarizationWithUnreferencedDataStoreAfterTime = async (
		approximateUnreferenceTimestampMs: number,
	) => {
		const container = await makeContainer();
		const defaultDataObject = (await container.getEntryPoint()) as ITestDataObject;
		await waitForContainerConnection(container);

		const handleKey = "handle";
		const testDataObject = await createDataStore(defaultDataObject);
		const unreferencedId = testDataObject._context.id;

		// Create/reference a DDS under the datastore, it will become Tombstoned with it
		const map = SharedMap.create(testDataObject._runtime);
		testDataObject._root.set("dds1", map.handle);

		// Reference a datastore - important for making it live
		defaultDataObject._root.set(handleKey, testDataObject.handle);
		// Unreference a datastore
		defaultDataObject._root.delete(handleKey);

		// Summarize
		const { container: summarizingContainer1, summarizer: summarizer1 } =
			await loadSummarizer(container);
		const summaryVersion = (await summarize(summarizer1)).summaryVersion;

		// Send a trailing op to the unreferenced datastore for additional scenario coverage
		testDataObject._root.set("send while unreferenced", "op");
		await provider.ensureSynchronized();

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
	const sendOpToUpdateSummaryTimestampToNow = async (
		container: IContainer,
		isSummarizerContainer = false,
	) => {
		let defaultDataObject = (await container.getEntryPoint()) as ITestDataObject;
		if (isSummarizerContainer) {
			const runtime = (defaultDataObject as any).runtime as ContainerRuntime;
			const entryPoint = (await runtime.getAliasedDataStoreEntryPoint("default")) as
				| IFluidHandle<ITestDataObject>
				| undefined;
			if (entryPoint === undefined) {
				throw new Error("default dataStore must exist");
			}
			defaultDataObject = await entryPoint.get();
		}
		defaultDataObject._root.set("send a", `op ${opCount++}`);
	};

	const getTombstonedDataObjectFromSummary = async (summaryVersion: string, id: string) => {
		// Load a container with the data store tombstoned
		const container = await loadContainer(summaryVersion);

		// Transition container to write mode
		const defaultDataObject = (await container.getEntryPoint()) as ITestDataObject;
		defaultDataObject._root.set("send a", "op");

		// Get dataObject
		const containerRuntime = defaultDataObject._context.containerRuntime as any;
		const dataStoreContext = containerRuntime.channelCollection.contexts.get(id);
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

	async function createDataStore(sourceDataStore: ITestDataObject) {
		const ds =
			await sourceDataStore._context.containerRuntime.createDataStore(TestDataObjectType);
		const dataStore = (await ds.entryPoint.get()) as ITestDataObject;
		assert(
			dataStore !== undefined,
			"Should have been able to retrieve testDataObject from entryPoint",
		);
		return dataStore;
	}

	async function resolveHandleHelper(
		containerRuntime: ContainerRuntime,
		id: string,
	): Promise<ITestDataObject> {
		try {
			const request = { url: id };
			const response = await containerRuntime.resolveHandle(request);
			if (response.status !== 200) {
				throw responseToException(response, request);
			}
			return response.value as ITestDataObject;
		} catch (e) {
			return Promise.reject(e);
		}
	}

	describe("Using tombstone data stores not allowed (per config)", () => {
		beforeEach("extraSettings", () => {
			// Allow Loading but not Usage
			configProvider.set("Fluid.GarbageCollection.ThrowOnTombstoneLoadOverride", false);
			configProvider.set("Fluid.GarbageCollection.ThrowOnTombstoneUsage", true);
		});

		itExpects(
			"Send ops fails for tombstoned datastores in summarizing container loaded after tombstone timeout",
			[
				{
					eventName:
						"fluid:telemetry:FluidDataStoreContext:GC_Tombstone_DataStore_Changed",
					callSite: "submitMessage",
					clientType: "interactive",
				},
			],
			async () => {
				const { unreferencedId, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(tombstoneTimeoutMs);

				// The datastore should be tombstoned now
				const { summaryVersion } = await summarize(summarizer);

				const dataObject = await getTombstonedDataObjectFromSummary(
					summaryVersion,
					unreferencedId,
				);

				// Modifying a testDataObject substantiated from the request pattern should fail!
				assert.throws(
					() => dataObject._root.set("send", "op"),
					(error: IErrorBase) => {
						const correctErrorType = error.errorType === "dataCorruptionError";
						const correctErrorMessage =
							error.message?.startsWith(`Context is tombstoned`) === true;
						return correctErrorType && correctErrorMessage;
					},
					`Should not be able to send ops for a tombstoned datastore.`,
				);
			},
		);

		itExpects(
			"Receive ops fails for tombstoned datastores in summarizing container loaded after sweep time",
			[
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					error: "Context is tombstoned! Call site [process]",
					errorType: "dataCorruptionError",
					clientType: "interactive",
				},
			],
			async () => {
				const { unreferencedId, summarizer, summaryVersion, summarizingContainer } =
					await summarizationWithUnreferencedDataStoreAfterTime(tombstoneTimeoutMs);
				// Load this container from a summary that had not yet tombstoned the datastore so that the datastore loads.
				const container = await loadContainer(summaryVersion);
				// Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
				// production application
				// This does not cause a sweep ready changed error as the container has loaded from a summary before sweep
				// ready was set
				const entryPoint = (await container.getEntryPoint()) as ITestDataObject;
				const containerRuntime = entryPoint._context.containerRuntime as ContainerRuntime;
				const response = await containerRuntime.resolveHandle({ url: unreferencedId });
				const senderObject = response.value as ITestDataObject;

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

		itExpects(
			"Send signals fails for tombstoned datastores in summarizing container loaded after tombstone timeout",
			[
				{
					eventName:
						"fluid:telemetry:FluidDataStoreContext:GC_Tombstone_DataStore_Changed",
					callSite: "submitSignal",
					clientType: "interactive",
				},
			],
			async () => {
				const { unreferencedId, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(tombstoneTimeoutMs);
				// The datastore should be tombstoned now
				const { summaryVersion } = await summarize(summarizer);

				const dataObject = await getTombstonedDataObjectFromSummary(
					summaryVersion,
					unreferencedId,
				);

				// Sending a signal from a testDataObject substantiated from the request pattern should fail!
				assert.throws(
					() => dataObject._runtime.submitSignal("send", "signal"),
					(error: IErrorBase) => {
						const correctErrorType = error.errorType === "dataCorruptionError";
						const correctErrorMessage =
							error.message?.startsWith(`Context is tombstoned`) === true;
						return correctErrorType && correctErrorMessage;
					},
					`Should not be able to send signals for a tombstoned datastore.`,
				);
			},
		);

		itExpects(
			"Receive signals fails for tombstoned datastores in summarizing container loaded after tombstone timeout",
			[
				{
					eventName:
						"fluid:telemetry:FluidDataStoreContext:GC_Tombstone_DataStore_Changed",
					category: "generic",
					error: "Context is tombstoned! Call site [processSignal]",
					clientType: "noninteractive/summarizer",
				},
				{
					eventName:
						"fluid:telemetry:FluidDataStoreContext:GC_Tombstone_DataStore_Changed",
					error: "Context is tombstoned! Call site [processSignal]",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					error: "Context is tombstoned! Call site [processSignal]",
					errorType: "dataCorruptionError",
					clientType: "interactive",
				},
			],
			async () => {
				const { unreferencedId, summarizer, summaryVersion } =
					await summarizationWithUnreferencedDataStoreAfterTime(tombstoneTimeoutMs);
				// The datastore should be tombstoned now
				await summarize(summarizer);

				// Load this container from a summary that had not yet tombstoned the datastore so that the datastore loads.
				const container = await loadContainer(summaryVersion);
				// Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
				// production application
				// This does not cause a sweep ready changed error as the container has loaded from a summary before sweep
				// ready was set
				const entryPoint = (await container.getEntryPoint()) as ITestDataObject;
				const containerRuntime = entryPoint._context.containerRuntime as ContainerRuntime;
				const response = await containerRuntime.resolveHandle({ url: unreferencedId });
				const senderObject = response.value as ITestDataObject;

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

	describe("Loading tombstoned data stores", () => {
		const expectedHeadersLogged = {
			request: "{}",
			handleGet: JSON.stringify({ viaHandle: true }),
			request_allowTombstone: JSON.stringify({ allowTombstone: true }),
			request_subDataStoreHandle: JSON.stringify({
				viaHandle: true,
				allowTombstone: true,
				allowInactive: true,
			}),
		};

		beforeEach("extraSettings", () => {
			// Allow Usage but not Loading
			configProvider.set("Fluid.GarbageCollection.ThrowOnTombstoneLoadOverride", true);
			configProvider.set("Fluid.GarbageCollection.ThrowOnTombstoneUsage", false);
		});

		itExpects(
			"Requesting tombstoned datastores fails in interactive client loaded after tombstone timeout (but SubDataStore load is allowed)",
			[
				// Interactive client's request
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					headers: expectedHeadersLogged.request,
					clientType: "interactive",
				},
				// Interactive client's request w/ allowTombstone
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					headers: expectedHeadersLogged.request_allowTombstone,
					clientType: "interactive",
				},
				// Summarizer client's request
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					headers: expectedHeadersLogged.request,
					clientType: "noninteractive/summarizer",
				},
			],
			async () => {
				const mockLogger = new MockLogger();

				const { unreferencedId, summarizingContainer, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(tombstoneTimeoutMs);
				await sendOpToUpdateSummaryTimestampToNow(summarizingContainer, true);

				// The datastore should be tombstoned now
				const { summaryVersion } = await summarize(summarizer);
				const container = await loadContainer(
					summaryVersion,
					/* disableTombstoneFailureViaGCGenerationOption: */ false,
					mockLogger,
				);

				// This request fails since the datastore is tombstoned
				const entryPoint = (await container.getEntryPoint()) as ITestDataObject;
				const tombstoneErrorResponse = await (
					entryPoint._context.containerRuntime as ContainerRuntime
				).resolveHandle({
					url: unreferencedId,
				});
				assert.equal(
					tombstoneErrorResponse.status,
					404,
					"Should not be able to retrieve a tombstoned datastore in non-summarizer clients",
				);
				assert.equal(
					tombstoneErrorResponse.value,
					`DataStore was tombstoned: ${unreferencedId}`,
					"Expected the Tombstone error message",
				);
				assert.equal(
					tombstoneErrorResponse.headers?.[TombstoneResponseHeaderKey],
					true,
					"Expected the Tombstone header",
				);

				// This request succeeds because the "allowTombstone" header is set to true
				const tombstoneSuccessResponse = await (
					entryPoint._context.containerRuntime as ContainerRuntime
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

				mockLogger.assertMatch(
					[
						// request WITHOUT allowTombsone
						{
							category: "error",
							eventName:
								"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
							clientType: "interactive",
							headers: expectedHeadersLogged.request,
							id: { value: `/${unreferencedId}`, tag: TelemetryDataTag.CodeArtifact },
							trackedId: `/${unreferencedId}`,
						},
						// request WITH allowTombsone
						{
							category: "generic",
							eventName:
								"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
							headers: expectedHeadersLogged.request_allowTombstone,
							clientType: "interactive",
							id: { value: `/${unreferencedId}`, tag: TelemetryDataTag.CodeArtifact },
							trackedId: `/${unreferencedId}`,
						},
					],
					undefined,
					true /* inlineDetailsProp */,
				);

				// handle.get on a DDS in a tombstoned object should succeed (despite not being able to pass the header)
				const dataObject = tombstoneSuccessResponse.value as ITestDataObject;
				const ddsHandle = dataObject._root.get<IFluidHandleInternal<ISharedMap>>("dds1");
				assert(ddsHandle !== undefined, "Expected to find a handle to the DDS");
				await assert.doesNotReject(
					async () => ddsHandle.get(),
					"Should be able to get a tombstoned DDS via its handle",
				);

				const untrackedHandle = manufactureHandle(
					dataObject._context.IFluidHandleContext,
					`/${unreferencedId}/unrecognizedSubPath`,
				);
				await assert.rejects(
					async () => untrackedHandle.get(),
					"RequestHandler not implemented, so we just get the 404 from ContainerRuntime",
				);

				mockLogger.assertMatch(
					[
						// DDS request
						{
							category: "generic",
							eventName:
								"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_SubDataStore_Requested",
							clientType: "interactive",
							headers: expectedHeadersLogged.request_subDataStoreHandle,
							id: {
								value: ddsHandle.absolutePath,
								tag: TelemetryDataTag.CodeArtifact,
							},
							trackedId: `/${unreferencedId}`,
						},
						// untracked SubDataStore request
						{
							category: "generic",
							eventName:
								"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_SubDataStore_Requested",
							clientType: "interactive",
							headers: expectedHeadersLogged.request_subDataStoreHandle,
							id: {
								value: untrackedHandle.absolutePath,
								tag: TelemetryDataTag.CodeArtifact,
							},
							trackedId: `/${unreferencedId}`,
						},
					],
					undefined,
					true /* inlineDetailsProp */,
				);

				// This request succeeds because the summarizer never fails for tombstones
				const summarizerRuntime = (summarizer as any).runtime as ContainerRuntime;
				const summarizerResponse = await summarizerRuntime.resolveHandle({
					url: unreferencedId,
				});
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

		itExpects(
			"Requesting tombstoned datastores succeeds for legacy document given gcGeneration option is defined",
			[
				// Interactive client's request that succeeds
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					clientType: "interactive",
				},
			],
			async function () {
				// Note: The Summarizers in this test don't use the "future" GC option - it only matters for the interactive client
				const { unreferencedId, summarizingContainer, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(tombstoneTimeoutMs);
				await sendOpToUpdateSummaryTimestampToNow(summarizingContainer, true);

				// The datastore should be tombstoned now
				const { summaryVersion } = await summarize(summarizer);
				const logger = new MockLogger();
				const container = await loadContainer(
					summaryVersion,
					true /* disableTombstoneFailureViaGCGenerationOption */,
					logger,
				);

				// This request succeeds even though the datastore is tombstoned, on account of the later gcGeneration passed in
				const entryPoint = (await container.getEntryPoint()) as ITestDataObject;
				const tombstoneSuccessResponse = await (
					entryPoint._context.containerRuntime as ContainerRuntime
				).resolveHandle({
					url: unreferencedId,
				});
				assert.equal(
					tombstoneSuccessResponse.status,
					200,
					"Should be able to retrieve a tombstoned datastore given gcGeneration",
				);
				assert.notEqual(
					tombstoneSuccessResponse.headers?.[TombstoneResponseHeaderKey],
					true,
					"DID NOT Expect tombstone header to be set on the response",
				);
			},
		);

		itExpects(
			"Requesting tombstoned datastores succeeds with when gcGeneration differs from persisted value",
			[
				// Interactive client's request that succeeds
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					clientType: "interactive",
				},
			],
			async function () {
				// This will become the persisted value in the container(s) created below (except the one with disableTombstoneFailureViaOption)
				// NOTE: IT IS RESET AT THE END OF THE TEST
				testContainerConfig.runtimeOptions!.gcOptions!.gcGeneration = 1;

				// Note: The Summarizers in this test don't use the "future" GC option - it only matters for the interactive client
				const { unreferencedId, summarizingContainer, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(tombstoneTimeoutMs);
				await sendOpToUpdateSummaryTimestampToNow(summarizingContainer, true);

				// The datastore should be tombstoned now
				const { summaryVersion } = await summarize(summarizer);
				const container = await loadContainer(
					summaryVersion,
					true /* disableTombstoneFailureViaGCGenerationOption */,
				);

				// This request succeeds even though the datastore is tombstoned, on account of the later gcGeneration passed in
				const entryPoint = (await container.getEntryPoint()) as ITestDataObject;
				const tombstoneSuccessResponse = await (
					entryPoint._context.containerRuntime as ContainerRuntime
				).resolveHandle({
					url: unreferencedId,
				});
				assert.equal(
					tombstoneSuccessResponse.status,
					200,
					"Should be able to retrieve a tombstoned datastore given gcGeneration",
				);
				assert.notEqual(
					tombstoneSuccessResponse.headers?.[TombstoneResponseHeaderKey],
					true,
					"DID NOT Expect tombstone header to be set on the response",
				);

				testContainerConfig.runtimeOptions!.gcOptions!.gcGeneration = undefined;
			},
		);

		itExpects(
			"Handle request for tombstoned datastores fails in summarizing container loaded after tombstone timeout",
			[
				// Interactive client's handle.get
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					headers: expectedHeadersLogged.handleGet,
					clientType: "interactive",
				},
				// Interactive client's request w/ allowTombstone
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					headers: expectedHeadersLogged.request_allowTombstone,
					clientType: "interactive",
				},
			],
			async () => {
				const { unreferencedId, summarizingContainer, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(tombstoneTimeoutMs);
				await sendOpToUpdateSummaryTimestampToNow(summarizingContainer, true);

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
				let tombstoneError: ExpectedTombstoneError | undefined;
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
					`DataStore was tombstoned: /${unreferencedId}`,
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

		itExpects(
			"Can un-tombstone datastores by storing a handle",
			[
				// When confirming it's tombstoned
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					clientType: "interactive",
				},
				// When reviving it
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					clientType: "interactive",
				},
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Revived",
					clientType: "noninteractive/summarizer",
				},
			],
			async () => {
				const { unreferencedId, summarizingContainer, summarizer } =
					await summarizationWithUnreferencedDataStoreAfterTime(
						tombstoneTimeoutMs - remainingTimeUntilSweepMs,
					);
				// Wait enough time so that the datastore is sweep ready
				await delay(remainingTimeUntilSweepMs);

				await sendOpToUpdateSummaryTimestampToNow(summarizingContainer, true);

				// The datastore should be tombstoned now
				const { summaryVersion } = await summarize(summarizer);
				const tombstoneContainer = await loadContainer(summaryVersion);

				// Datastore should be tombstoned, requesting should error
				const entryPoint = (await tombstoneContainer.getEntryPoint()) as ITestDataObject;
				const containerRuntime = entryPoint._context.containerRuntime as ContainerRuntime;
				const tombstoneResponse = await containerRuntime.resolveHandle({
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
				const tombstoneAllowedResponse =
					await containerRuntime.resolveHandle(requestAllowingTombstone);
				const tombstonedObject = tombstoneAllowedResponse.value as ITestDataObject;
				const defaultDataObject =
					(await tombstoneContainer.getEntryPoint()) as ITestDataObject;
				defaultDataObject._root.set("store", tombstonedObject.handle);

				// The datastore should be un-tombstoned now
				const { summaryVersion: revivalVersion } = await summarize(summarizer);
				const revivalContainer = await loadContainer(revivalVersion);
				const revivalEntryPoint =
					(await revivalContainer.getEntryPoint()) as ITestDataObject;
				const revivalContainerRuntime = revivalEntryPoint._context
					.containerRuntime as ContainerRuntime;
				const revivalResponse = await revivalContainerRuntime.resolveHandle({
					url: unreferencedId,
				});
				const revivedObject = revivalResponse.value as ITestDataObject;
				revivedObject._root.set("can send", "op");
				// This signal call closes the tombstoneContainer.
				// The op above doesn't because the signal reaches the tombstone container faster
				revivedObject._runtime.submitSignal("can submit", "signal");

				const sendingContainer = await loadContainer(revivalVersion);
				const sendingEntryPoint =
					(await sendingContainer.getEntryPoint()) as ITestDataObject;
				const sendingContainerRuntime = sendingEntryPoint._context
					.containerRuntime as ContainerRuntime;
				const sendingResponse = await sendingContainerRuntime.resolveHandle({
					url: unreferencedId,
				});
				const sendDataObject = sendingResponse.value as ITestDataObject;
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

		itExpects(
			"Requesting tombstoned datastore triggers auto-recovery",
			[
				// 1A
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					clientType: "interactive",
					category: "error",
				},
				// 1A again
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					clientType: "interactive",
					category: "error",
				},
				// 3A
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					clientType: "interactive",
					category: "error",
				},
				// 3B
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					clientType: "interactive",
					category: "error",
				},
			],
			async () => {
				const mockLogger = new MockLogger();
				const summarizerMockLogger = new MockLogger();
				const initialContainer = await makeContainer();
				const { container: summarizingContainer, summarizer } = await loadSummarizer(
					initialContainer,
					/* summaryVersion: */ undefined,
					summarizerMockLogger,
				);
				await waitForContainerConnection(initialContainer);

				const defaultDataObject =
					(await initialContainer.getEntryPoint()) as ITestDataObject;

				// Create dataStoreA and dataStoreB. dataStoreA has reference to dataStoreB. Then unreference dataStoreA.
				const dataStoreA = await createDataStore(defaultDataObject);
				const dataStoreB = await createDataStore(defaultDataObject);
				const dataStoreAId = dataStoreA._context.id;
				const dataStoreBId = dataStoreB._context.id;
				dataStoreA._root.set("dsB", dataStoreB.handle);
				defaultDataObject._root.set("dsA", dataStoreA.handle);
				defaultDataObject._root.delete("dsA");

				// Summarize to set unreferenced timestamp.
				// Then wait the Tombstone timeout and update current timestamp, and summarize again
				await summarize(summarizer);
				await delay(tombstoneTimeoutMs);
				await sendOpToUpdateSummaryTimestampToNow(summarizingContainer, true);
				const { summaryVersion } = await summarize(summarizer);

				// The datastore should be tombstoned in the snapshot this container loads from
				const container1 = await loadContainer(
					summaryVersion,
					/* disableTombstoneFailureViaGCGenerationOption: */ false,
					mockLogger,
				);

				// Simulate an invalid reference to DataStoreA from the app, for this properly unreferenced (Tombstoned) object (will affect subtree including B too)
				const entryPoint1 = (await container1.getEntryPoint()) as ITestDataObject;
				const tombstoneErrorResponse1 = await (
					entryPoint1._context.containerRuntime as ContainerRuntime
				).resolveHandle({
					url: dataStoreAId,
				});
				assert.equal(
					tombstoneErrorResponse1.status,
					404,
					"Should not be able to retrieve a tombstoned datastore in non-summarizer clients (1A)",
				);
				assert.equal(
					tombstoneErrorResponse1.value,
					`DataStore was tombstoned: ${dataStoreAId}`,
					"Expected the Tombstone error message (1A)",
				);
				assert.equal(
					tombstoneErrorResponse1.headers?.[TombstoneResponseHeaderKey],
					true,
					"Expected the Tombstone header (1A)",
				);

				// The GC TombstoneLoaded op should roundtrip here
				await provider.ensureSynchronized();

				// TombstoneLoaded op should trigger Revived event
				[mockLogger, summarizerMockLogger].forEach((logger, i) =>
					logger.assertMatch(
						[
							{
								eventName:
									"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Revived",
								clientType: i === 0 ? "interactive" : "noninteractive/summarizer",
							},
						],
						`Missing expected revived event from Auto-Recovery [${
							i === 0 ? "mockLogger" : "summarizerMockLogger"
						}]`,
					),
				);

				// This request still fails because Auto-Recovery only affects the next summary (via next GC run)
				const tombstoneErrorResponse_Interactive = await (
					entryPoint1._context.containerRuntime as ContainerRuntime
				).resolveHandle({
					url: dataStoreAId,
				});
				assert.equal(
					tombstoneErrorResponse_Interactive.status,
					404,
					"Expected tombstone error - Auto-Recovery shouldn't affect in-progress Interactive sessions (1A again)",
				);

				// Auto-Recovery: This summary will have the unref timestamp reset due to the GC TombstoneLoaded op
				const { summaryVersion: summaryVersion2 } = await summarize(summarizer);
				const container2 = await loadContainer(summaryVersion2);

				// Verify that the object is not Tombstoned in summarizingContainer - it just summarized with the TombstoneLoaded op
				const summarizerResponse = await (
					summarizer as unknown as { runtime: ContainerRuntime }
				).runtime.resolveHandle({
					url: dataStoreAId,
				});
				assert.equal(
					summarizerResponse.status,
					200,
					"Auto-Recovery should have kicked in immediately in Summarizer after summarizing with the TombstoneLoaded op",
				);

				// Container2 loaded after auto-recovery: These requests succeed because the datastores are no longer tombstoned
				const entryPoint2 = (await container2.getEntryPoint()) as ITestDataObject;
				const successResponse2A = await (
					entryPoint2._context.containerRuntime as ContainerRuntime
				).resolveHandle({
					url: dataStoreAId,
				});
				assert.equal(
					successResponse2A.status,
					200,
					"Auto-Recovery should have made the object no longer tombstoned (2A)",
				);
				assert.notEqual(
					successResponse2A.headers?.[TombstoneResponseHeaderKey],
					true,
					"DID NOT Expect tombstone header to be set on the success response (2A)",
				);
				const successResponse2B = await (
					entryPoint2._context.containerRuntime as ContainerRuntime
				).resolveHandle({
					url: dataStoreBId,
				});
				assert.equal(
					successResponse2B.status,
					200,
					"Auto-Recovery should have made the object no longer tombstoned (2B)",
				);
				assert.notEqual(
					successResponse2B.headers?.[TombstoneResponseHeaderKey],
					true,
					"DID NOT Expect tombstone header to be set on the success response (2B)",
				);

				// Wait the Tombstone timeout then summarize and load another container
				// It will be tombstoned again since it's been unreferenced the whole time
				await delay(tombstoneTimeoutMs);
				await sendOpToUpdateSummaryTimestampToNow(summarizingContainer, true);
				const { summaryVersion: summaryVersion3 } = await summarize(summarizer);
				const container3 = await loadContainer(summaryVersion3);
				const entryPoint3 = (await container3.getEntryPoint()) as ITestDataObject;
				const tombstoneErrorResponse3A = await (
					entryPoint3._context.containerRuntime as ContainerRuntime
				).resolveHandle({
					url: dataStoreAId,
				});
				assert.equal(
					tombstoneErrorResponse3A.status,
					404,
					"Object should become tombstoned again after the timeout (3A)",
				);
				assert.equal(
					tombstoneErrorResponse3A.value,
					`DataStore was tombstoned: ${dataStoreAId}`,
					"Expected the Tombstone error message (3A)",
				);
				const tombstoneErrorResponse3B = await (
					entryPoint3._context.containerRuntime as ContainerRuntime
				).resolveHandle({
					url: dataStoreBId,
				});
				assert.equal(
					tombstoneErrorResponse3B.status,
					404,
					"Object should become tombstoned again after the timeout (3B)",
				);
				assert.equal(
					tombstoneErrorResponse3B.value,
					`DataStore was tombstoned: ${dataStoreBId}`,
					"Expected the Tombstone error message (3B)",
				);
			},
		);

		itExpects(
			"Requesting WRONGLY-tombstoned datastore triggers auto-recovery and self-repair",
			[
				// 1A
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					clientType: "interactive",
					category: "error",
				},
				// 1A again
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					clientType: "interactive",
					category: "error",
				},
				// During the Summarize after auto-recovery is triggered (results in summaryVersion2)
				{
					eventName: "fluid:telemetry:Summarizer:Running:gcUnknownOutboundReferences",
					clientType: "noninteractive/summarizer",
					// id: { value: "/default/root", tag: "CodeArtifact" }, (nested object comparison not supported)
					summarizeReason: "onDemand/Summarize after auto-recovery",
				},
			],
			async () => {
				const mockLogger = new MockLogger();
				const summarizerMockLogger = new MockLogger();
				const initialContainer = await makeContainer();
				const { container: summarizingContainer0, summarizer: summarizer0 } =
					await loadSummarizer(
						initialContainer,
						/* summaryVersion: */ undefined,
						summarizerMockLogger,
					);
				await waitForContainerConnection(initialContainer);

				const defaultDataObject =
					(await initialContainer.getEntryPoint()) as ITestDataObject;

				// Create dataStoreA and dataStoreX and reference them from the default data object.
				// They will both remain referenced, but the reference will be "lost" (by intentionally corrupting the GC Data)
				// dataStoreX's purpose is for updating the currentReferenceTimestamp before summarizing by sending ops
				const dataStoreA = await createDataStore(defaultDataObject);
				const dataStoreX = await createDataStore(defaultDataObject);
				const dataStoreAId = dataStoreA._context.id;
				defaultDataObject._root.set("dsA", dataStoreA.handle);
				defaultDataObject._root.set("dsX", dataStoreX.handle);

				// Summarize to get a baseline for incremental summary/GC, then load a new summarizer (and close the first one)
				const { summaryVersion: summaryVersion0 } = await summarize(summarizer0);
				summarizingContainer0.close();
				const { container: closeMe, summarizer: summarizer_toBeCorrupted } =
					await loadSummarizer(initialContainer, summaryVersion0, summarizerMockLogger);

				// Monkey patch in the tweak to GC Data, removing outbound routes from default's root DDS
				const garbageCollector_toBeCorrupted = (
					summarizer_toBeCorrupted as unknown as {
						runtime: {
							garbageCollector: {
								baseGCDetailsP: Promise<IGarbageCollectionDetailsBase>;
							};
						};
					}
				).runtime.garbageCollector;
				const id = defaultDataObject._runtime.id;
				garbageCollector_toBeCorrupted.baseGCDetailsP =
					garbageCollector_toBeCorrupted.baseGCDetailsP.then((baseGCDetails) => {
						// baseGCDetails outbound routes for this DDS currently include dataStoreA and dataStoreX. Remove those.
						baseGCDetails.gcData!.gcNodes[`/${id}/root`] = [`/${id}`];
						return baseGCDetails;
					});

				// Generate a summary with corrupted GC Data (missing route to dataStore A)
				const { summaryVersion: summaryVersion_corrupted } = await summarize(
					summarizer_toBeCorrupted,
					{
						reason: "Summarize with corrupted GC Data",
					},
				);
				closeMe.close();

				// Then wait the Tombstone timeout and update current timestamp, and summarize again
				await delay(tombstoneTimeoutMs);
				dataStoreX._root.set("update", "timestamp");
				const { summarizer } = await loadSummarizer(
					initialContainer,
					summaryVersion_corrupted,
					summarizerMockLogger,
				);
				const { summaryVersion: summaryVersion_withTombstone } =
					await summarize(summarizer);

				// The datastore should be tombstoned in the snapshot this container loads from,
				// even though the datastores are properly referenced and easily reachable.
				const container1 = await loadContainer(
					summaryVersion_withTombstone,
					/* disableTombstoneFailureViaGCGenerationOption: */ false,
					mockLogger,
				);

				// Load DataStoreA, which will incorrectly be Tombstoned, triggering auto-recovery.
				const defaultDataObject1 = (await container1.getEntryPoint()) as ITestDataObject;
				const handleA1 = defaultDataObject1._root.get<IFluidHandle>("dsA");
				let tombstoneError: ExpectedTombstoneError | undefined;
				try {
					await handleA1!.get();
				} catch (error: any) {
					tombstoneError = error;
				}
				assert.equal(
					tombstoneError?.code,
					404,
					"Tombstone error from handle.get should have 404 status code (1A)",
				);
				assert.equal(
					tombstoneError?.message,
					`DataStore was tombstoned: /${dataStoreAId}`,
					"Incorrect message for Tombstone error from handle.get (1A)",
				);
				assert.equal(
					tombstoneError?.underlyingResponseHeaders?.[TombstoneResponseHeaderKey],
					true,
					"Tombstone error from handle.get should include the tombstone flag (1A)",
				);

				// The GC TombstoneLoaded op should roundtrip here
				await provider.ensureSynchronized();

				// TombstoneLoaded op should trigger Revived event
				[mockLogger, summarizerMockLogger].forEach((logger, i) =>
					logger.assertMatch(
						[
							{
								eventName:
									"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Revived",
								clientType: i === 0 ? "interactive" : "noninteractive/summarizer",
							},
						],
						`Missing expected revived event from Auto-Recovery [${
							i === 0 ? "mockLogger" : "summarizerMockLogger"
						}]`,
					),
				);

				// This request still fails because Auto-Recovery only affects the next summary (via next GC run)
				// NOTE: We have to use request pattern because handleA1 has its result cached so will not exercise the right codepath
				const tombstoneErrorResponse_Interactive = await (
					defaultDataObject1._context.containerRuntime as ContainerRuntime
				).resolveHandle({
					url: dataStoreAId,
				});
				assert.equal(
					tombstoneErrorResponse_Interactive.status,
					404,
					"Expected tombstone error - Auto-Recovery shouldn't affect in-progress Interactive sessions (1A again)",
				);

				// Auto-Recovery: This summary will have the unref timestamp reset and will run full GC due to the GC TombstoneLoaded op
				const { summaryVersion: summaryVersion_repaired } = await summarize(summarizer, {
					reason: "Summarize after auto-recovery",
				});
				const container2 = await loadContainer(summaryVersion_repaired);

				// Verify that the object is not Tombstoned in summarizingContainer - it just summarized with the TombstoneLoaded op
				const tombstones = (
					summarizer as unknown as {
						runtime: { garbageCollector: { tombstones: string[] } };
					}
				).runtime.garbageCollector.tombstones;
				assert.deepEqual(
					tombstones,
					[],
					"Expected no Tombstones. Auto-Recovery should have kicked in immediately in Summarizer after summarizing with the TombstoneLoaded op",
				);

				// Container2 loaded after auto-recovery: These requests succeed because the datastores are no longer tombstoned
				const entryPoint2 = (await container2.getEntryPoint()) as ITestDataObject;
				await assert.doesNotReject(
					async () => entryPoint2._root.get<IFluidHandle>("dsA")!.get(),
					"Auto-Recovery should have made the object no longer tombstoned (2A)",
				);

				// Wait the Tombstone timeout then summarize and load another container
				// Since auto-recovery triggered full GC, the corruption was repaired and GC knows dataStoreA is referenced
				// Otherwise it would have been unreferenced and would have become tombstoned again
				await delay(tombstoneTimeoutMs);
				dataStoreX._root.set("update", "timestamp again");
				const { summaryVersion: summaryVersion_stillRepaired } =
					await summarize(summarizer);
				const container3 = await loadContainer(summaryVersion_stillRepaired);
				const defaultDataObject3 = (await container3.getEntryPoint()) as ITestDataObject;
				const handleA3 = defaultDataObject3._root.get<IFluidHandle>("dsA");
				await assert.doesNotReject(
					async () => handleA3!.get(),
					"Corrupted GC Data should have been repaired such that this object is known to be referenced (3A)",
				);
			},
		);
	});

	itExpects(
		"Loading/Using tombstone allowed when configured",
		[
			{
				eventName:
					"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
				clientType: "interactive",
			},
			{
				eventName: "fluid:telemetry:FluidDataStoreContext:GC_Tombstone_DataStore_Changed",
				callSite: "submitMessage",
				clientType: "interactive",
			},
			{
				eventName:
					"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Changed",
				clientType: "noninteractive/summarizer",
			},
			{
				eventName:
					"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Changed",
				clientType: "interactive",
			},
		],
		async () => {
			configProvider.set("Fluid.GarbageCollection.ThrowOnTombstoneLoadOverride", false);
			configProvider.set("Fluid.GarbageCollection.ThrowOnTombstoneUsage", false);
			const { unreferencedId, summarizingContainer, summarizer } =
				await summarizationWithUnreferencedDataStoreAfterTime(tombstoneTimeoutMs);
			await sendOpToUpdateSummaryTimestampToNow(summarizingContainer, true);

			// The datastore should be tombstoned now
			const { summaryVersion } = await summarize(summarizer);
			const container = await loadContainer(summaryVersion);
			// Requesting the tombstoned data store should succeed since ThrowOnTombstoneLoadOverride is not enabled.
			// Logs a tombstone and sweep ready error
			let dataObject: ITestDataObject;
			const entryPoint = (await container.getEntryPoint()) as ITestDataObject;
			const containerRuntime = entryPoint._context.containerRuntime as ContainerRuntime;
			await assert.doesNotReject(async () => {
				dataObject = await resolveHandleHelper(containerRuntime, unreferencedId);
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

		beforeEach("extraSettings", () => {
			// This is not the typical configuration we expect (usage may be allowed), but keeping it more strict for the tests
			configProvider.set("Fluid.GarbageCollection.ThrowOnTombstoneLoadOverride", true);
			configProvider.set("Fluid.GarbageCollection.ThrowOnTombstoneUsage", true);
		});

		it("adds tombstone data stores information to tombstone blob in summary", async () => {
			const mainContainer = await provider.makeTestContainer(testContainerConfig);
			const mainDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
			const mainDataStoreUrl = `/${mainDataStore._context.id}`;
			await waitForContainerConnection(mainContainer);

			const { summarizer } = await createSummarizer(
				provider,
				mainContainer,
				summarizerTestConfig,
			);

			// Create couple of data stores.
			const newDataStore = await createDataStore(mainDataStore);
			const newDataStore2 = await createDataStore(mainDataStore);
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

			// Wait for tombstone timeout so that the data stores are tombstoned.
			await delay(tombstoneTimeoutMs + 10);
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
			const mainDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
			const mainDataStoreUrl = `/${mainDataStore._context.id}`;
			await waitForContainerConnection(mainContainer);

			const { summarizer } = await createSummarizer(
				provider,
				mainContainer,
				summarizerTestConfig,
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

			// Wait for tombstone timeout so that the blob is tombstoned.
			await delay(tombstoneTimeoutMs + 10);
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
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Revived",
					clientType: "noninteractive/summarizer",
				},
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Revived",
					clientType: "noninteractive/summarizer",
				},
			],
			async () => {
				const mainContainer = await provider.makeTestContainer(testContainerConfig);
				const mainDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
				const mainDataStoreUrl = `/${mainDataStore._context.id}`;
				await waitForContainerConnection(mainContainer);

				const mockLogger = new MockLogger();

				const { summarizer } = await createSummarizer(
					provider,
					mainContainer,
					summarizerTestConfig,
					undefined,
					mockLogger,
				);

				// Create couple of data stores.
				const newDataStore = await createDataStore(mainDataStore);
				const newDataStore2 = await createDataStore(mainDataStore);
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

				// Wait for tombstone timeout so that the data stores are tombstoned.
				await delay(tombstoneTimeoutMs + 10);
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
							"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Revived",
						clientType: "noninteractive/summarizer",
					},
					{
						eventName:
							"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Revived",
						clientType: "noninteractive/summarizer",
					},
				]);

				// Mark one of the data stores and attachment blob as referenced so that they are not tombstones anymore.
				// Note that tombstoneTimeout was shrunk below sessionExpiry, otherwise we'd need to load a new container and
				// use the allowTombstone header to even get the handle and revive these.
				mainDataStore._root.set("newDataStore", newDataStore.handle);
				mainDataStore._root.set("blob", blobHandle);
				await provider.ensureSynchronized();
				mockLogger.assertMatch(
					[
						{
							eventName:
								"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Revived",
							clientType: "noninteractive/summarizer",
						},
						{
							eventName:
								"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Revived",
							clientType: "noninteractive/summarizer",
						},
					],
					"Revived events not found as expected",
				);

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
			const mainDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
			await waitForContainerConnection(mainContainer);

			const { summarizer } = await createSummarizer(
				provider,
				mainContainer,
				summarizerTestConfig,
			);

			// Create a data store.
			const newDataStore = await createDataStore(mainDataStore);

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

			// Wait for tombstone timeout so that the data stores are tombstoned.
			await delay(tombstoneTimeoutMs + 10);
			// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
			mainDataStore._root.set("key", "value");
			await provider.ensureSynchronized();

			// Summarize. The tombstoned data stores should now be part of the summary.
			const summary2 = await summarizeNow(summarizer);
			assert.throws(
				() => getGCStateFromSummary(summary2.summaryTree),
				(e: Error) =>
					validateAssertionError(e, "getGCStateFromSummary: GC state is not a blob"),
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
				(e: Error) =>
					validateAssertionError(
						e,
						"getGCTombstoneStateFromSummary: GC data should be a tree",
					),
			);
		});

		itExpects(
			"can mark data store from tombstone information in summary in non-summarizer container",
			[
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					clientType: "interactive",
				},
			],
			async () => {
				const mainContainer = await provider.makeTestContainer(testContainerConfig);
				const mainDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
				const mainDataStoreUrl = `/${mainDataStore._context.id}`;
				await waitForContainerConnection(mainContainer);

				const { summarizer } = await createSummarizer(
					provider,
					mainContainer,
					summarizerTestConfig,
				);

				// Create a data store and mark it referenced.
				const newDataStore = await createDataStore(mainDataStore);
				const newDataStoreUrl = `/${newDataStore._context.id}`;
				mainDataStore._root.set("newDataStore", newDataStore.handle);

				// Remove the data store's handle to make it unreferenced.
				mainDataStore._root.delete("newDataStore");

				// Summarize so that the above data stores are marked unreferenced.
				await provider.ensureSynchronized();
				const summary = await summarizeNow(summarizer);
				validateTombstoneState(summary.summaryTree, undefined /* tombstones */, []);

				// Wait for tombstone timeout so that the data stores are tombstoned.
				await delay(tombstoneTimeoutMs + 10);
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
				const entryPoint2 = (await container2.getEntryPoint()) as ITestDataObject;
				const containerRuntime2 = entryPoint2._context.containerRuntime as ContainerRuntime;
				await assert.rejects(
					async () => resolveHandleHelper(containerRuntime2, unreferencedId),
					(error: any) => {
						const correctErrorType = error.code === 404;
						const correctErrorMessage =
							error.message === `DataStore was tombstoned: ${unreferencedId}`;
						return correctErrorType && correctErrorMessage;
					},
					`Should not be able to retrieve a tombstoned datastore.`,
				);
			},
		);
	});

	/**
	 * These tests validate cases where we saw unexpected tombstone behavior in the past - tombstone revived
	 * events were logged, data stores were un-tombstoned unexpectedly, etc.
	 */
	describe("No unexpected tombstone revival in unreachable subtrees", () => {
		beforeEach("extraSettings", () => {
			configProvider.set("Fluid.GarbageCollection.ThrowOnTombstoneLoadOverride", false);
			configProvider.set("Fluid.GarbageCollection.ThrowOnTombstoneUsage", false);
			// Disable AutoRecovery because these tests request tombstoned objects to validate they're tombstones,
			// And then are testing to ensure that various neutral actions don't revive them - but AutoRecovery would!
			configProvider.set("Fluid.GarbageCollection.DisableAutoRecovery", true);
		});
		/**
		 * In interactive clients, when a tombstoned data store is loaded that has reference to another tombstoned
		 * data store, revived events should not be logged.
		 */
		itExpects(
			"Should not log tombstone revived events when data store is not revived in interactive clients",
			[
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					clientType: "interactive",
				},
			],
			async () => {
				const container = await makeContainer();
				const defaultDataObject = (await container.getEntryPoint()) as ITestDataObject;
				await waitForContainerConnection(container);

				// Create dataStore2 and dataStore3. dataStore2 has reference to dataStore3 and
				// dataStore2 is unreferenced.
				const dataStore2 = await createDataStore(defaultDataObject);
				const dataStore3 = await createDataStore(defaultDataObject);
				dataStore2._root.set("ds3", dataStore3.handle);
				defaultDataObject._root.set("ds2", dataStore2.handle);
				defaultDataObject._root.delete("ds2");

				// Summarize. dataStore2 and dataStore will be unreferenced.
				const { summarizer } = await loadSummarizer(container);
				await provider.ensureSynchronized();
				await summarize(summarizer);

				// Wait for tombstone timeout and send an op to update current reference timestamp. The next summary
				// will have dataStore2 and dataStore3 as tombstones.
				await delay(tombstoneTimeoutMs + 100);
				defaultDataObject._root.set("update", "timestamp");
				await provider.ensureSynchronized();
				const { summaryVersion } = await summarize(summarizer);

				// Load a container from the above summary. Request dataStore2 and validate that dataStore3
				// should not be revived. Since dataStore2 has a handle to dataStore3, this should not result
				// in a revived event for dataStore3.
				const mockLogger = new MockLogger();
				const configWithLogger: ITestContainerConfig = {
					...testContainerConfig,
					loaderProps: { ...testContainerConfig.loaderProps, logger: mockLogger },
				};
				const container2 = await provider.loadTestContainer(configWithLogger, {
					[LoaderHeader.version]: summaryVersion,
				});
				const entryPoint2 = (await container2.getEntryPoint()) as ITestDataObject;
				const containerRuntime2 = entryPoint2._context.containerRuntime as ContainerRuntime;
				await assert.doesNotReject(
					async () => resolveHandleHelper(containerRuntime2, dataStore2._context.id),
					`Should be able to request a tombstoned datastore.`,
				);
				mockLogger.assertMatchNone(
					[
						{
							eventName:
								"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Revived",
						},
					],
					"Events not found as expected",
				);
			},
		);

		/**
		 * In summarizer client, when a tombstoned data store is loaded that has a reference to another data store,
		 * this should not result in the second data store getting un-tombstoned.
		 */
		itExpects(
			"Should not un-tombstone data store when it is not revived in summarizer client",
			[
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					clientType: "interactive",
				},
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					clientType: "interactive",
				},
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					clientType: "interactive",
				},
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					clientType: "interactive",
				},
			],
			async () => {
				configProvider.set("Fluid.GarbageCollection.ThrowOnTombstoneLoadOverride", true);
				const container = await makeContainer();
				const defaultDataObject = (await container.getEntryPoint()) as ITestDataObject;
				await waitForContainerConnection(container);

				// Create dataStore2 and dataStore3. dataStore2 has reference to dataStore3 and unreference dataStore2.
				const dataStore2 = await createDataStore(defaultDataObject);
				const dataStore3 = await createDataStore(defaultDataObject);
				dataStore2._root.set("ds3", dataStore3.handle);
				defaultDataObject._root.set("ds2", dataStore2.handle);
				defaultDataObject._root.delete("ds2");

				// Summarize. dataStore2 and dataStore3 will be unreferenced.
				const { summarizer: summarizer1 } = await loadSummarizer(container);
				await provider.ensureSynchronized();
				await summarize(summarizer1);

				// Wait for tombstone timeout and send an op to update current reference timestamp. The next summary
				// will have dataStore2 and dataStore3 as tombstones.
				await delay(tombstoneTimeoutMs + 100);
				defaultDataObject._root.set("update", "timestamp");
				await provider.ensureSynchronized();
				const { summaryVersion: summaryVersion1 } = await summarize(summarizer1);
				const container2 = await loadContainer(summaryVersion1);

				// Requesting dataStore2 and dataStore3 should fail in container2.
				const entryPoint2 = (await container2.getEntryPoint()) as ITestDataObject;
				const containerRuntime2 = entryPoint2._context.containerRuntime as ContainerRuntime;
				await assert.rejects(
					async () => resolveHandleHelper(containerRuntime2, dataStore2._context.id),
					(error: any) => {
						const correctErrorType = error.code === 404;
						const correctErrorMessage =
							error.message === `DataStore was tombstoned: ${dataStore2._context.id}`;
						return correctErrorType && correctErrorMessage;
					},
					`Should not be able to request dataStore2 which is tombstoned`,
				);
				await assert.rejects(
					async () => resolveHandleHelper(containerRuntime2, dataStore3._context.id),
					(error: any) => {
						const correctErrorType = error.code === 404;
						const correctErrorMessage =
							error.message === `DataStore was tombstoned: ${dataStore3._context.id}`;
						return correctErrorType && correctErrorMessage;
					},
					`Should not be able to request dataStore3 which is tombstoned`,
				);

				// Load a new summarizer from the last summary. This is done so that dataStore2 is loaded again
				// and results in notifying GC of the reference to dataStore3. This will not happen in summarizer1
				// because the handle to dataStore3 has already need parsed.
				summarizer1.close();
				const mockLogger = new MockLogger();
				const { summarizer: summarizer2 } = await loadSummarizer(
					container,
					summaryVersion1,
					mockLogger,
				);
				// Send an op from dataStore2's root DDS and request dataStore2 so that the DDS is loaded and the
				// handle to dataStore3 is parsed resulting in a notification to GC of reference to dataStore3.
				dataStore2._root.set("just", "an op");
				await provider.ensureSynchronized();
				// Note: Summarizer client never throws on loading tombstoned data stores.
				await assert.doesNotReject(
					async () =>
						resolveHandleHelper((summarizer2 as any).runtime, dataStore2._context.id),
					`Should be able to request dataStore2 which is tombstoned in summarizer`,
				);
				// Summarize again. This should not result in any of the data stores getting un-tombstoned.
				const { summaryVersion: summaryVersion2 } = await summarize(summarizer2);
				// There shouldn't be any revived event for dataStore3 because it is not revived.
				// In the past, the DDS in dataStore2 was loaded and the handle to dataStore3 was parsed resulting
				// in a notification to GC of reference to dataStore3 and this event would be logged in error.
				mockLogger.assertMatchNone(
					[
						{
							eventName:
								"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Revived",
						},
					],
					"Revived event not as expected",
				);

				// Load a new container from the above summary and validate dataStore2 and dataStore3 are tombstoned.
				const container3 = await loadContainer(summaryVersion2);
				const entryPoint3 = (await container3.getEntryPoint()) as ITestDataObject;
				const containerRuntime3 = entryPoint3._context.containerRuntime as ContainerRuntime;
				await assert.rejects(
					async () => resolveHandleHelper(containerRuntime3, dataStore2._context.id),
					(error: any) => {
						const correctErrorType = error.code === 404;
						const correctErrorMessage =
							error.message === `DataStore was tombstoned: ${dataStore2._context.id}`;
						return correctErrorType && correctErrorMessage;
					},
					`Should not be able to request dataStore2 which is tombstoned - 2`,
				);
				// dataStore3 should still be tombstoned.
				await assert.rejects(
					async () => resolveHandleHelper(containerRuntime3, dataStore3._context.id),
					(error: any) => {
						const correctErrorType = error.code === 404;
						const correctErrorMessage =
							error.message === `DataStore was tombstoned: ${dataStore3._context.id}`;
						return correctErrorType && correctErrorMessage;
					},
					`Should not be able to request dataStore3 which is tombstoned - 2`,
				);
			},
		);

		/**
		 * In summarizer client, when a tombstoned data store is loaded that has internal references (among DDS),
		 * this should not result in the data store getting un-tombstoned.
		 */
		itExpects(
			"Should not un-tombstone data store due to internal references in summarizer client",
			[
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					clientType: "interactive",
				},
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					clientType: "noninteractive/summarizer",
					category: "generic",
				},
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_DataStore_Requested",
					clientType: "interactive",
				},
			],
			async () => {
				configProvider.set("Fluid.GarbageCollection.ThrowOnTombstoneLoadOverride", true);
				const container = await makeContainer();
				const defaultDataObject = (await container.getEntryPoint()) as ITestDataObject;
				await waitForContainerConnection(container);

				// Create dataStore2 and a second DDS in it. Unreference dataStore2.
				const dataStore2 = await createDataStore(defaultDataObject);
				const dds2 = SharedMap.create(dataStore2._runtime);
				dataStore2._root.set("dds2", dds2.handle);
				defaultDataObject._root.set("ds2", dataStore2.handle);
				defaultDataObject._root.delete("ds2");

				// Summarize. dataStore2 will be unreferenced.
				const { summarizer: summarizer1 } = await loadSummarizer(container);
				await provider.ensureSynchronized();
				await summarize(summarizer1);

				// Wait for tombstone timeout and send an op to update current reference timestamp. The next summary
				// will have dataStore2 as tombstone.
				await delay(tombstoneTimeoutMs + 100);
				defaultDataObject._root.set("update", "timestamp");
				await provider.ensureSynchronized();
				const { summaryVersion: summaryVersion1 } = await summarize(summarizer1);
				const container2 = await loadContainer(summaryVersion1);

				// Requesting dataStore2 should fail in container2.
				const entryPoint2 = (await container2.getEntryPoint()) as ITestDataObject;
				const containerRuntime2 = entryPoint2._context.containerRuntime as ContainerRuntime;
				await assert.rejects(
					async () => resolveHandleHelper(containerRuntime2, dataStore2._context.id),
					(error: any) => {
						const correctErrorType = error.code === 404;
						const correctErrorMessage =
							error.message === `DataStore was tombstoned: ${dataStore2._context.id}`;
						return correctErrorType && correctErrorMessage;
					},
					`Should not be able to request dataStore2 which is tombstoned`,
				);

				// Load a new summarizer from the last summary. This is done so that dataStore2 is loaded again.
				// It should NOT result in notifying GC of the reference between DDSes, since addedOutboundReference
				// is no longer called during DDS parse
				summarizer1.close();
				const mockLogger = new MockLogger();
				const { summarizer: summarizer2 } = await loadSummarizer(
					container,
					summaryVersion1,
					mockLogger,
				);
				// Send an op from dataStore2's root DDS and request dataStore2 so that the DDS is loaded and the
				// handle to dds2 is parsed - should not result in a notification to GC of references.
				dataStore2._root.set("just", "an op");
				await provider.ensureSynchronized();
				// Note: Summarizer client never throws on loading tombstoned data stores.
				await assert.doesNotReject(
					async () =>
						resolveHandleHelper(
							(summarizer2 as any).runtime as ContainerRuntime,
							dataStore2._context.id,
						),
					`Should be able to request dataStore2 which is tombstoned in summarizer`,
				);
				// Summarize again. This should not result in any of the data stores getting un-tombstoned.
				const { summaryVersion: summaryVersion2 } = await summarize(summarizer2);
				// There shouldn't be any revived event for dataStore2 because it is not revived.
				// In the past, the handle to dataStore2 was parsed again resulting
				// in a notification to GC of reference to dataStore2 and this event would be logged in error.
				mockLogger.assertMatchNone(
					[
						{
							eventName:
								"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_SubDataStore_Revived",
						},
					],
					"Revived event not as expected",
				);

				// Load a new container from the above summary and validate dataStore2 is still tombstoned.
				const container3 = await loadContainer(summaryVersion2);
				const entryPoint3 = (await container3.getEntryPoint()) as ITestDataObject;
				const containerRuntime3 = entryPoint3._context.containerRuntime as ContainerRuntime;
				await assert.rejects(
					async () => resolveHandleHelper(containerRuntime3, dataStore2._context.id),
					`Should not be able to request dataStore2 which is tombstoned - 2`,
				);
			},
		);
	});
});
