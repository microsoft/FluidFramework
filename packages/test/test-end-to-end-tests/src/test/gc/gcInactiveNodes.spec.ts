/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { stringToBuffer } from "@fluid-internal/client-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import {
	AllowInactiveRequestHeaderKey,
	ContainerRuntime,
	InactiveResponseHeaderKey,
	ISummarizer,
} from "@fluidframework/container-runtime";
import { IFluidHandle, IFluidHandleContext } from "@fluidframework/core-interfaces";
import { DriverHeader } from "@fluidframework/driver-definitions";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { MockLogger, TelemetryDataTag } from "@fluidframework/telemetry-utils";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	createSummarizer,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import {
	describeCompat,
	ITestDataObject,
	itExpects,
	TestDataObjectType,
} from "@fluid-private/test-version-utils";
import { SharedMap } from "@fluidframework/map";
import { FluidSerializer, parseHandles } from "@fluidframework/shared-object-base";
import { waitForContainerWriteModeConnectionWrite } from "./gcTestSummaryUtils.js";

/**
 * We manufacture a handle to simulate a bug where an object is unreferenced in GC's view
 * (and reminder, interactive clients never update their GC data after loading),
 * but someone still has a handle to it.
 *
 * It's possible to achieve this truly with multiple clients where one revives it mid-session
 * after it was unreferenced for the inactive timeout, but that's more complex to implement
 * in a test and is no better than this approach
 */
function manufactureHandle<T>(handleContext: IFluidHandleContext, url: string): IFluidHandle<T> {
	const serializer = new FluidSerializer(handleContext, () => {});
	const handle: IFluidHandle<T> = parseHandles({ type: "__fluid_handle__", url }, serializer);
	return handle;
}

/**
 * Validates this scenario: When a GC node (data store or attachment blob) becomes inactive, i.e, it has been
 * unreferenced for a certain amount of time, using the node results in an error telemetry.
 */
describeCompat("GC inactive nodes tests", "NoCompat", (getTestObjectProvider) => {
	const revivedEvent = "fluid:telemetry:ContainerRuntime:InactiveObject_Revived";
	const changedEvent = "fluid:telemetry:ContainerRuntime:InactiveObject_Changed";
	const loadedEvent = "fluid:telemetry:ContainerRuntime:InactiveObject_Loaded";
	const inactiveTimeoutMs = 100;

	function makeTestContainerConfig(
		params: { throwOnInactiveLoad?: true } = {},
	): ITestContainerConfig {
		const { throwOnInactiveLoad } = params;
		return {
			runtimeOptions: {
				gcOptions: { inactiveTimeoutMs, throwOnInactiveLoad },
			},
		};
	}

	const testContainerConfig = makeTestContainerConfig();
	const testContainerConfigWithThrowOption = makeTestContainerConfig({
		throwOnInactiveLoad: true,
	});

	let provider: ITestObjectProvider;
	let mockLogger: MockLogger;

	/** Waits for the inactive timeout to expire. */
	async function waitForInactiveTimeout(): Promise<void> {
		await new Promise<void>((resolve) => {
			setTimeout(resolve, inactiveTimeoutMs + 10);
		});
	}

	/** Validates that none of the inactive events have been logged since the last run. */
	function validateNoInactiveEvents() {
		assert(
			!mockLogger.matchAnyEvent([
				{ eventName: revivedEvent },
				{ eventName: changedEvent },
				{ eventName: loadedEvent },
			]),
			"inactive object events should not have been logged",
		);
	}

	/**
	 * Loads a summarizer client with the given version (if any) and returns its container runtime and summary
	 * collection.
	 */
	async function createSummarizerClient(config: ITestContainerConfig) {
		const requestHeader = {
			[LoaderHeader.cache]: false,
			[LoaderHeader.clientDetails]: {
				capabilities: { interactive: true },
				type: "summarizer",
			},
			[DriverHeader.summarizingClient]: true,
			[LoaderHeader.reconnect]: false,
		};
		const summarizerContainer = await provider.loadTestContainer(config, requestHeader);

		const summarizer = await summarizerContainer.getEntryPoint();
		return (summarizer as any).runtime as ContainerRuntime;
	}

	async function summarize(containerRuntime: ContainerRuntime) {
		await provider.ensureSynchronized();
		return containerRuntime.summarize({
			runGC: true,
			fullTree: true,
			trackState: false,
		});
	}

	describe("Inactive timeout", () => {
		let containerRuntime: IContainerRuntimeBase;
		let mainContainer: IContainer;
		let defaultDataStore: ITestDataObject;

		const waitForSummary = async (summarizer: ISummarizer) => {
			await provider.ensureSynchronized();
			const summaryResult = await summarizeNow(summarizer);
			return summaryResult.summaryVersion;
		};

		async function createNewDataObject() {
			const dataStore = await containerRuntime.createDataStore(TestDataObjectType);
			return dataStore.entryPoint.get() as Promise<ITestDataObject>;
		}

		beforeEach(async function () {
			provider = getTestObjectProvider({ syncSummarizer: true });
			// These tests validate the end-to-end behavior of GC features by generating ops and summaries. However,
			// it does not post these summaries or download them. So, it doesn't need to run against real services.
			if (provider.driver.type !== "local") {
				this.skip();
			}

			mockLogger = new MockLogger();
			mainContainer = await provider.makeTestContainer(testContainerConfig);
			defaultDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
			containerRuntime = defaultDataStore._context.containerRuntime;
			await waitForContainerConnection(mainContainer);
		});

		itExpects(
			"can generate events when unreferenced data store is accessed after it's inactive",
			[{ eventName: changedEvent }, { eventName: loadedEvent }, { eventName: revivedEvent }],
			async () => {
				const summarizerRuntime = await createSummarizerClient({
					...testContainerConfigWithThrowOption, // But summarizer should NOT throw
					loaderProps: { logger: mockLogger },
				});
				const dataObject = await createNewDataObject();
				const url = dataObject.handle.absolutePath;

				defaultDataStore._root.set("dataStore1", dataObject.handle);
				await provider.ensureSynchronized();

				// Mark dataStore1 as unreferenced, send an op and load it.
				defaultDataStore._root.delete("dataStore1");
				dataObject._root.set("key", "value2");
				await provider.ensureSynchronized();
				await summarizerRuntime.resolveHandle({ url });

				// Summarize and validate that no unreferenced errors were logged.
				await summarize(summarizerRuntime);
				validateNoInactiveEvents();

				// Wait for inactive timeout. This will ensure that the unreferenced data store is inactive.
				await waitForInactiveTimeout();

				// Make changes to the inactive data store and validate that we get the changedEvent.
				dataObject._root.set("key", "value");
				await provider.ensureSynchronized();
				// Load the data store and validate that we get loadedEvent.
				const response = await summarizerRuntime.resolveHandle({ url });
				assert.equal(
					response.status,
					200,
					"Loading the inactive object should succeed on summarizer despite throwOnInactiveLoad option",
				);
				await summarize(summarizerRuntime);
				mockLogger.assertMatch(
					[
						{
							eventName: changedEvent,
							timeout: inactiveTimeoutMs,
							id: { value: url, tag: TelemetryDataTag.CodeArtifact },
							pkg: { value: TestDataObjectType, tag: TelemetryDataTag.CodeArtifact },
						},
						{
							eventName: loadedEvent,
							timeout: inactiveTimeoutMs,
							id: { value: url, tag: TelemetryDataTag.CodeArtifact },
							pkg: { value: TestDataObjectType, tag: TelemetryDataTag.CodeArtifact },
						},
					],
					"changed and loaded events not generated as expected",
					true /* inlineDetailsProp */,
				);

				// Make a change again and validate that we don't get another changedEvent as we only log it
				// once per data store per session.
				dataObject._root.set("key2", "value2");
				await summarize(summarizerRuntime);
				validateNoInactiveEvents();

				// Revive the inactive data store and validate that we get the revivedEvent event.
				defaultDataStore._root.set("dataStore1", dataObject.handle);
				await summarize(summarizerRuntime);
				mockLogger.assertMatch(
					[
						{
							eventName: revivedEvent,
							timeout: inactiveTimeoutMs,
							id: { value: url, tag: TelemetryDataTag.CodeArtifact },
							pkg: { value: TestDataObjectType, tag: TelemetryDataTag.CodeArtifact },
							fromId: {
								value: defaultDataStore._root.handle.absolutePath,
								tag: TelemetryDataTag.CodeArtifact,
							},
						},
					],
					"revived event not generated as expected",
					true /* inlineDetailsProp */,
				);
			},
		);

		itExpects(
			"can generate events when unreferenced attachment blob is accessed after it's inactive",
			[{ eventName: loadedEvent }, { eventName: revivedEvent }],
			async () => {
				const summarizerRuntime = await createSummarizerClient({
					...testContainerConfig,
					loaderProps: { logger: mockLogger },
				});
				const entryPoint = await summarizerRuntime.getAliasedDataStoreEntryPoint("default");
				if (entryPoint === undefined) {
					throw new Error("Summarizer must have default data store");
				}
				const summarizerDefaultDataStore = (await entryPoint.get()) as ITestDataObject;

				// Upload an attachment blobs and mark them referenced.
				const blobContents = "Blob contents";
				const blobHandle = await defaultDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);
				defaultDataStore._root.set("blob", blobHandle);

				await provider.ensureSynchronized();

				// Get the blob handle in the summarizer client. Don't retrieve the underlying blob yet. We will do that
				// after the blob node is inactive.
				const summarizerBlobHandle =
					summarizerDefaultDataStore._root.get<IFluidHandle<ArrayBufferLike>>("blob");
				assert(
					summarizerBlobHandle !== undefined,
					"Blob handle not sync'd to summarizer client",
				);

				// Summarize and validate that no unreferenced errors were logged.
				await summarize(summarizerRuntime);
				validateNoInactiveEvents();

				// Mark blob as unreferenced, summarize and validate that no unreferenced errors are logged yet.
				defaultDataStore._root.delete("blob");
				await summarize(summarizerRuntime);
				validateNoInactiveEvents();

				// Wait for inactive timeout. This will ensure that the unreferenced blob is inactive.
				await waitForInactiveTimeout();

				// Retrieve the blob in the summarizer client now and validate that we get the loadedEvent.
				await summarizerBlobHandle.get();
				await summarize(summarizerRuntime);
				mockLogger.assertMatch(
					[
						{
							eventName: loadedEvent,
							timeout: inactiveTimeoutMs,
							id: {
								value: summarizerBlobHandle.absolutePath,
								tag: TelemetryDataTag.CodeArtifact,
							},
						},
					],
					"updated event not generated as expected for attachment blobs",
					true /* inlineDetailsProp */,
				);

				// Add the handle back, summarize and validate that we get the revivedEvent.
				defaultDataStore._root.set("blob", blobHandle);
				await provider.ensureSynchronized();
				await summarize(summarizerRuntime);
				mockLogger.assertMatch(
					[
						{
							eventName: revivedEvent,
							timeout: inactiveTimeoutMs,
							id: {
								value: summarizerBlobHandle.absolutePath,
								tag: TelemetryDataTag.CodeArtifact,
							},
						},
					],
					"revived event not generated as expected for attachment blobs",
					true /* inlineDetailsProp */,
				);
			},
		);

		itExpects(
			"can generate events when unreferenced DDS is accessed after it's inactive",
			[{ eventName: changedEvent }, { eventName: loadedEvent }],
			async () => {
				const summarizerRuntime = await createSummarizerClient({
					...testContainerConfigWithThrowOption, // But summarizer should NOT throw
					loaderProps: { logger: mockLogger },
				});
				const dataObject = await createNewDataObject();
				const dataStoreUrl = dataObject.handle.absolutePath;
				const ddsUrl = dataObject._root.handle.absolutePath;

				defaultDataStore._root.set("dataStore1", dataObject.handle);
				await provider.ensureSynchronized();

				// Mark dataStore1 as unreferenced, send an op and load its DDS.
				defaultDataStore._root.delete("dataStore1");
				dataObject._root.set("key", "value2");
				await provider.ensureSynchronized();
				await summarizerRuntime.resolveHandle({ url: ddsUrl });

				// Summarize and validate that no unreferenced errors were logged.
				await summarize(summarizerRuntime);
				validateNoInactiveEvents();

				// Wait for inactive timeout. This will ensure that the unreferenced DDS is inactive.
				await waitForInactiveTimeout();

				// Make changes to the inactive data store and validate that we get the changedEvent.
				dataObject._root.set("key", "value");
				await provider.ensureSynchronized();
				// Load the DDS and validate that we get loadedEvent.
				const response = await summarizerRuntime.resolveHandle({ url: ddsUrl });
				assert.equal(
					response.status,
					200,
					"Loading the inactive object should succeed on summarizer despite throwOnInactiveLoad option",
				);
				await summarize(summarizerRuntime);
				mockLogger.assertMatch(
					[
						{
							eventName: changedEvent,
							timeout: inactiveTimeoutMs,
							id: { value: dataStoreUrl, tag: TelemetryDataTag.CodeArtifact },
							pkg: { value: TestDataObjectType, tag: TelemetryDataTag.CodeArtifact },
						},
						{
							eventName: loadedEvent,
							timeout: inactiveTimeoutMs,
							id: { value: ddsUrl, tag: TelemetryDataTag.CodeArtifact },
							pkg: { value: TestDataObjectType, tag: TelemetryDataTag.CodeArtifact },
						},
					],
					"changed and loaded events not generated as expected",
					true /* inlineDetailsProp */,
				);
			},
		);

		describe("Interactive (non-summarizer) clients", () => {
			/** Expected type of error thrown when loading an inactiveObject (if disallowed) */
			type InactiveLoadError = Error & {
				code: number;
				underlyingResponseHeaders?: {
					[InactiveResponseHeaderKey]: boolean;
				};
			};

			itExpects(
				"throwOnInactiveLoad: true; DataStore handle.get -- throws and logs",
				[
					{
						eventName:
							"fluid:telemetry:ContainerRuntime:GarbageCollector:InactiveObject_Loaded",
					},
				],
				async () => {
					// Create a summarizer client that will be used to summarize the container.
					const { summarizer: summarizer1 } = await createSummarizer(
						provider,
						mainContainer,
						{
							runtimeOptions: {
								gcOptions: { inactiveTimeoutMs },
							},
						},
					);

					// Create a data store, mark it as referenced and then unreferenced
					const dataObject = await createNewDataObject();
					const dataStoreUrl = dataObject.handle.absolutePath;
					defaultDataStore._root.set("dataStore", dataObject.handle);
					defaultDataStore._root.delete("dataStore");

					// Summarize the container while it's unreferenced. This summary will be used to load another container.
					const summaryVersion1 = await waitForSummary(summarizer1);

					// Wait for inactive timeout. This will ensure that the unreferenced data store is inactive.
					await waitForInactiveTimeout();

					// Load a non-summarizer container from the above summary that uses the mock logger. This container has to
					// be in "write" mode for GC to initialize unreferenced nodes from summary.
					const container2 = await provider.loadTestContainer(
						{
							...testContainerConfigWithThrowOption,
							loaderProps: { logger: mockLogger },
						},
						{ [LoaderHeader.version]: summaryVersion1 },
					);
					const defaultDataStoreContainer2 =
						(await container2.getEntryPoint()) as ITestDataObject;
					defaultDataStoreContainer2._root.set("mode", "write");
					await waitForContainerWriteModeConnectionWrite(container2);

					// Load the inactive data store. This should result in a loaded event from the non-summarizer container.
					const handle = manufactureHandle<ITestDataObject>(
						defaultDataStoreContainer2._context.IFluidHandleContext, // yields the ContaineRuntime's handleContext
						dataStoreUrl,
					);
					try {
						// This throws because the DataStore is inactive and throwOnInactiveLoad is set
						await handle.get();
						assert.fail("Expected handle.get to throw");
					} catch (error: any) {
						const inactiveError: InactiveLoadError | undefined = error;
						assert.equal(inactiveError?.code, 404, "Incorrect error status code");
						assert.equal(
							inactiveError?.message,
							`DataStore is inactive: ${dataStoreUrl}`,
						);
						assert.equal(
							inactiveError?.underlyingResponseHeaders?.[InactiveResponseHeaderKey],
							true,
							"Inactive error from handle.get should include the inactive flag",
						);
					}
					mockLogger.assertMatch(
						[
							{
								eventName:
									"fluid:telemetry:ContainerRuntime:GarbageCollector:InactiveObject_Loaded",
								timeout: inactiveTimeoutMs,
								id: { value: dataStoreUrl, tag: TelemetryDataTag.CodeArtifact },
							},
						],
						"loaded event not generated as expected",
						true /* inlineDetailsProp */,
					);
				},
			);

			itExpects(
				"throwOnInactiveLoad: true; DDS handle.get -- Doesn't throw, and DOESN'T log",
				[
					// Bug: It SHOULD actually log
					// {
					// 	eventName:
					// 		"fluid:telemetry:ContainerRuntime:GarbageCollector:InactiveObject_Loaded",
					// },
				],
				async () => {
					// Create a summarizer client that will be used to summarize the container.
					const { summarizer: summarizer1 } = await createSummarizer(
						provider,
						mainContainer,
						{
							runtimeOptions: {
								gcOptions: { inactiveTimeoutMs },
							},
						},
					);

					// Create a data store, mark it as referenced and then unreferenced
					const dataObject = await createNewDataObject();
					const dds = dataObject._runtime.createChannel(
						"dds1",
						SharedMap.getFactory().type,
					);
					const ddsUrl = dds.handle.absolutePath;
					defaultDataStore._root.set("dds1", dds.handle);
					defaultDataStore._root.delete("dds1");

					// Summarize the container while it's unreferenced. This summary will be used to load another container.
					const summaryVersion1 = await waitForSummary(summarizer1);

					// Wait for inactive timeout. This will ensure that the unreferenced data store is inactive.
					await waitForInactiveTimeout();

					// Load a non-summarizer container from the above summary that uses the mock logger. This container has to
					// be in "write" mode for GC to initialize unreferenced nodes from summary.
					const container2 = await provider.loadTestContainer(
						{
							...testContainerConfigWithThrowOption,
							loaderProps: { logger: mockLogger },
						},
						{ [LoaderHeader.version]: summaryVersion1 },
					);
					const defaultDataStoreContainer2 =
						(await container2.getEntryPoint()) as ITestDataObject;
					defaultDataStoreContainer2._root.set("mode", "write");
					await waitForContainerWriteModeConnectionWrite(container2);

					// Load the inactive data store. This should result in a loaded event from the non-summarizer container.
					const handle = manufactureHandle<ITestDataObject>(
						defaultDataStoreContainer2._context.IFluidHandleContext, // yields the ContaineRuntime's handleContext
						ddsUrl,
					);

					// Even though the DataStore is inactive and throwOnInactiveLoad is set, we don't throw for DDSes for ease of use
					await assert.doesNotReject(
						async () => handle.get(),
						"handle.get() for the DDS should not throw",
					);

					// Bug: It SHOULD actually log
					// mockLogger.assertMatch(
					// 	[
					// 		{
					// 			eventName:
					// 				"fluid:telemetry:ContainerRuntime:GarbageCollector:InactiveObject_Loaded",
					// 			timeout: inactiveTimeoutMs,
					// 			id: {
					// 				value: `${dataStoreId}`,
					// 				tag: TelemetryDataTag.CodeArtifact,
					// 			},
					// 		},
					// 	],
					// 	"loaded event not generated as expected",
					// 	true /* inlineDetailsProp */,
					// );
				},
			);

			itExpects(
				"throwOnInactiveLoad: true; resolveHandle with header -- only logs",
				[
					{
						eventName:
							"fluid:telemetry:ContainerRuntime:GarbageCollector:InactiveObject_Loaded",
					},
				],
				async () => {
					// Create a summarizer client that will be used to summarize the container.
					const { summarizer: summarizer1 } = await createSummarizer(
						provider,
						mainContainer,
						{
							runtimeOptions: {
								gcOptions: { inactiveTimeoutMs },
							},
						},
					);

					// Create a data store, mark it as referenced and then unreferenced
					const dataObject = await createNewDataObject();
					const url = dataObject.handle.absolutePath;
					defaultDataStore._root.set("dataStore", dataObject.handle);
					defaultDataStore._root.delete("dataStore");

					// Summarize the container while it's unreferenced. This summary will be used to load another container.
					const summaryVersion1 = await waitForSummary(summarizer1);

					// Wait for inactive timeout. This will ensure that the unreferenced data store is inactive.
					await waitForInactiveTimeout();

					// Load a non-summarizer container from the above summary that uses the mock logger. This container has to
					// be in "write" mode for GC to initialize unreferenced nodes from summary.
					const container2 = await provider.loadTestContainer(
						{
							...testContainerConfigWithThrowOption,
							loaderProps: { logger: mockLogger },
						},
						{ [LoaderHeader.version]: summaryVersion1 },
					);
					const defaultDataStoreContainer2 =
						(await container2.getEntryPoint()) as ITestDataObject;
					defaultDataStoreContainer2._root.set("mode", "write");
					await waitForContainerWriteModeConnectionWrite(container2);

					const container2Runtime = defaultDataStoreContainer2._context
						.containerRuntime as ContainerRuntime;

					const response = await container2Runtime.resolveHandle({
						url,
						headers: { [AllowInactiveRequestHeaderKey]: true },
					});
					assert.equal(response.status, 200, "Expected 200 response");
					mockLogger.assertMatch(
						[
							{
								eventName:
									"fluid:telemetry:ContainerRuntime:GarbageCollector:InactiveObject_Loaded",
								timeout: inactiveTimeoutMs,
								id: { value: url, tag: TelemetryDataTag.CodeArtifact },
							},
						],
						"loaded event not generated as expected",
						true /* inlineDetailsProp */,
					);
				},
			);

			itExpects(
				"throwOnInactiveLoad: false; handle.get -- only logs",
				[
					{
						eventName:
							"fluid:telemetry:ContainerRuntime:GarbageCollector:InactiveObject_Loaded",
					},
				],
				async () => {
					// Create a summarizer client that will be used to summarize the container.
					const { summarizer: summarizer1 } = await createSummarizer(
						provider,
						mainContainer,
						{
							runtimeOptions: {
								gcOptions: { inactiveTimeoutMs },
							},
						},
					);

					// Create a data store, mark it as referenced and then unreferenced
					const dataObject = await createNewDataObject();
					const url = dataObject.handle.absolutePath;
					const unreferencedId = dataObject._context.id;
					defaultDataStore._root.set("dataStore", dataObject.handle);
					defaultDataStore._root.delete("dataStore");

					// Summarize the container while it's unreferenced. This summary will be used to load another container.
					const summaryVersion1 = await waitForSummary(summarizer1);

					// Wait for inactive timeout. This will ensure that the unreferenced data store is inactive.
					await waitForInactiveTimeout();

					// Load a non-summarizer container from the above summary that uses the mock logger. This container has to
					// be in "write" mode for GC to initialize unreferenced nodes from summary.
					const container2 = await provider.loadTestContainer(
						{
							...testContainerConfig, // NOT including the throwOnInactiveLoad flag
							loaderProps: { logger: mockLogger },
						},
						{ [LoaderHeader.version]: summaryVersion1 },
					);
					const defaultDataStoreContainer2 =
						(await container2.getEntryPoint()) as ITestDataObject;
					defaultDataStoreContainer2._root.set("mode", "write");
					await waitForContainerWriteModeConnectionWrite(container2);

					// Load the inactive data store. Should work fine since throwOnInactiveLoad was not set in options (but will log)
					const handle = manufactureHandle<ITestDataObject>(
						defaultDataStoreContainer2._context.IFluidHandleContext, // yields the ContaineRuntime's handleContext
						unreferencedId,
					);
					await handle.get();

					mockLogger.assertMatch(
						[
							{
								eventName:
									"fluid:telemetry:ContainerRuntime:GarbageCollector:InactiveObject_Loaded",
								timeout: inactiveTimeoutMs,
								id: { value: url, tag: TelemetryDataTag.CodeArtifact },
							},
						],
						"loaded event not generated as expected",
						true /* inlineDetailsProp */,
					);
				},
			);
		});

		/**
		 * This test validates that we can generate inactive object events for data stores which are not loaded
		 * when we identify the error. The following bug was fixed in this code path and this test covers that
		 * scenario - https://github.com/microsoft/FluidFramework/pull/10237.
		 *
		 * Note that the namespace for "inactiveObject_Revived" is different than the tests above because it is logged
		 * via the running summarizer's logger.
		 */
		itExpects(
			"can generate events for data stores that are not loaded",
			[
				{
					eventName: "fluid:telemetry:Summarizer:Running:InactiveObject_Revived",
				},
			],
			async () => {
				const { summarizer: summarizer1 } = await createSummarizer(
					provider,
					mainContainer,
					{
						runtimeOptions: {
							gcOptions: {
								inactiveTimeoutMs,
							},
						},
					},
				);

				const dataObject = await createNewDataObject();

				// Mark dataStore as referenced and then unreferenced; summarize.
				defaultDataStore._root.set("dataStore", dataObject.handle);
				defaultDataStore._root.delete("dataStore");
				const summaryVersion1 = await waitForSummary(summarizer1);

				// Load a new summarizer from the above summary such that the second data store is not loaded.
				summarizer1.close();
				const { summarizer: summarizer2 } = await createSummarizer(
					provider,
					mainContainer,
					{
						runtimeOptions: {
							gcOptions: {
								inactiveTimeoutMs,
							},
						},
					},
					summaryVersion1,
				);

				// Wait for inactive timeout. This will ensure that the unreferenced data store is inactive.
				await waitForInactiveTimeout();

				// Send an op for the deleted data store and revived it. There should not be any errors.
				dataObject._root.set("key", "value");
				defaultDataStore._root.set("dataStore", dataObject.handle);
				await provider.ensureSynchronized();

				// Summarize now. This is when the inactive object events will be logged.
				await assert.doesNotReject(
					waitForSummary(summarizer2),
					"Summary wasn't successful",
				);
			},
		);
	});
});
