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
import { ContainerRuntime, ISummarizer } from "@fluidframework/container-runtime/internal";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import type { IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import { delay } from "@fluidframework/core-utils/internal";
import { DriverHeader } from "@fluidframework/driver-definitions/internal";
import type { ISharedDirectory } from "@fluidframework/map/internal";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions/internal";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import { MockLogger, TelemetryDataTag } from "@fluidframework/telemetry-utils/internal";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	createSummarizer,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import { manufactureHandle } from "./gcTestSummaryUtils.js";

/**
 * Validates this scenario: When a GC node (data store or attachment blob) becomes inactive, i.e, it has been
 * unreferenced for a certain amount of time, using the node results in an error telemetry.
 */
describeCompat("GC inactive nodes tests", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedMap, SharedDirectory } = apis.dds;
	const revivedEvent = "fluid:telemetry:ContainerRuntime:InactiveObject_Revived";
	const changedEvent = "fluid:telemetry:ContainerRuntime:InactiveObject_Changed";
	const loadedEvent = "fluid:telemetry:ContainerRuntime:InactiveObject_Loaded";
	const inactiveTimeoutMs = 100;

	const testContainerConfig: ITestContainerConfig = {
		runtimeOptions: {
			gcOptions: { inactiveTimeoutMs },
		},
	};

	let provider: ITestObjectProvider;
	let mockLogger: MockLogger;

	/** Waits for the inactive timeout to expire (plus some margin) */
	const waitForInactiveTimeout = async () => delay(inactiveTimeoutMs + 10);

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

	async function loadContainer(
		configNoLoaderProps: ITestContainerConfig, // loaderProps gets overwritten
		summaryVersion: string,
		logger?: MockLogger,
	) {
		return provider.loadTestContainer(
			{
				...configNoLoaderProps,
				loaderProps: { logger },
			},
			{
				[LoaderHeader.version]: summaryVersion,
			},
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

		async function createNewDataObject(runtime: IContainerRuntimeBase = containerRuntime) {
			const dataStore = await runtime.createDataStore(TestDataObjectType);
			return dataStore.entryPoint.get() as Promise<ITestDataObject>;
		}

		beforeEach("setup", async function () {
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
					...testContainerConfig,
					loaderProps: { logger: mockLogger },
				});
				const dataObject = await createNewDataObject();
				const url = toFluidHandleInternal(dataObject.handle).absolutePath;

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

				// Revive the inactive data store (via both DDS reference and DataStore reference) and validate that we get the revivedEvent events.
				defaultDataStore._root.set("dataStore_root", dataObject._root.handle);
				defaultDataStore._root.set("dataStore1", dataObject.handle);
				await summarize(summarizerRuntime);
				mockLogger.assertMatch(
					[
						// For DDS
						{
							eventName: revivedEvent,
							timeout: inactiveTimeoutMs,
							trackedId: url,
							type: "SubDataStore",
							id: {
								value: toFluidHandleInternal(dataObject._root.handle).absolutePath,
								tag: TelemetryDataTag.CodeArtifact,
							},
							pkg: { value: TestDataObjectType, tag: TelemetryDataTag.CodeArtifact },
							fromId: {
								value: toFluidHandleInternal(defaultDataStore._root.handle).absolutePath,
								tag: TelemetryDataTag.CodeArtifact,
							},
						},
						// For DataStore
						{
							eventName: revivedEvent,
							timeout: inactiveTimeoutMs,
							trackedId: url,
							type: "DataStore",
							id: {
								value: url,
								tag: TelemetryDataTag.CodeArtifact,
							},
							pkg: { value: TestDataObjectType, tag: TelemetryDataTag.CodeArtifact },
							fromId: {
								value: toFluidHandleInternal(defaultDataStore._root.handle).absolutePath,
								tag: TelemetryDataTag.CodeArtifact,
							},
						},
					],
					"revived events not generated as expected",
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
					summarizerDefaultDataStore._root.get<IFluidHandleInternal<ArrayBufferLike>>("blob");
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
					...testContainerConfig,
					loaderProps: { logger: mockLogger },
				});
				const dataObject = await createNewDataObject();
				const dataStoreUrl = toFluidHandleInternal(dataObject.handle).absolutePath;
				const ddsUrl = toFluidHandleInternal(dataObject._root.handle).absolutePath;
				const untrackedUrl = `${dataStoreUrl}/unrecognizedSubPath`;

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
				// Load the DDS and untracked subDataStore path and validate that we get loadedEvents.
				const response1 = await summarizerRuntime.resolveHandle({ url: ddsUrl });
				assert.equal(
					response1.status,
					200,
					"Loading the inactive object should succeed on summarizer despite throwOnInactiveLoad option",
				);
				const response2 = await summarizerRuntime.resolveHandle({ url: untrackedUrl });
				assert.equal(
					response2.status,
					404,
					"404 would fall back to custom request handler (not implemented here)",
				);
				await summarize(summarizerRuntime);
				mockLogger.assertMatch(
					[
						{
							eventName: changedEvent,
							timeout: inactiveTimeoutMs,
							id: { value: dataStoreUrl, tag: TelemetryDataTag.CodeArtifact },
							pkg: { value: TestDataObjectType, tag: TelemetryDataTag.CodeArtifact },
							type: "DataStore",
						},
						{
							eventName: loadedEvent,
							timeout: inactiveTimeoutMs,
							id: { value: ddsUrl, tag: TelemetryDataTag.CodeArtifact },
							pkg: { value: TestDataObjectType, tag: TelemetryDataTag.CodeArtifact },
							trackedId: dataStoreUrl,
							type: "SubDataStore",
						},
						{
							eventName: loadedEvent,
							timeout: inactiveTimeoutMs,
							id: { value: untrackedUrl, tag: TelemetryDataTag.CodeArtifact },
							pkg: { value: TestDataObjectType, tag: TelemetryDataTag.CodeArtifact },
							trackedId: dataStoreUrl,
							type: "SubDataStore",
						},
					],
					"changed and loaded events not generated as expected",
					true /* inlineDetailsProp */,
				);
			},
		);

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
				const { summarizer: summarizer1 } = await createSummarizer(provider, mainContainer, {
					runtimeOptions: {
						gcOptions: {
							inactiveTimeoutMs,
						},
					},
				});

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
				await assert.doesNotReject(waitForSummary(summarizer2), "Summary wasn't successful");
			},
		);

		it("Reviving an InactiveObject clears Inactive state immediately in interactive client (but not for its subtree)", async () => {
			const container1 = mainContainer;
			const { summarizer: summarizer1 } = await createSummarizer(
				provider,
				container1,
				testContainerConfig,
			);
			const defaultDataObject1 = (await container1.getEntryPoint()) as ITestDataObject;
			await waitForContainerConnection(container1);

			const dataObjectA_1 = await createNewDataObject();
			const dataObjectB_1 = await createNewDataObject();
			const idA = dataObjectA_1._context.id;
			const idB = dataObjectB_1._context.id;

			// Reference A from the container entrypoint, and B from A
			defaultDataObject1._root.set("A", dataObjectA_1.handle);
			dataObjectA_1._root.set("B", dataObjectB_1.handle);

			// Then unreference the A-B chain (but leave it intact), and Summarize to start unreferenced tracking
			defaultDataObject1._root.delete("A");
			await provider.ensureSynchronized();
			const { summaryVersion: summaryVersion1 } = await summarizeNow(summarizer1);

			// A and B are unreferenced in container2/container3. Timers will be set
			// We need two containers because each event type is only logged once per container
			const mockLogger2 = new MockLogger();
			const container2 = await loadContainer(
				testContainerConfig,
				summaryVersion1,
				mockLogger2,
			);
			const defaultDataObject2 = (await container2.getEntryPoint()) as ITestDataObject;
			const mockLogger3 = new MockLogger();
			const container3 = await loadContainer(
				testContainerConfig,
				summaryVersion1,
				mockLogger3,
			);
			const defaultDataObject3 = (await container3.getEntryPoint()) as ITestDataObject;

			// Wait the Inactive Timeout. Timers will fire
			await waitForInactiveTimeout();

			// Load A in container2 and ensure InactiveObject_Loaded is logged
			const handleA_2 = manufactureHandle<ITestDataObject>(
				defaultDataObject2._context.IFluidHandleContext, // yields the ContaineRuntime's handleContext
				idA,
			);
			await handleA_2.get();
			mockLogger2.assertMatch(
				[
					{
						eventName:
							"fluid:telemetry:ContainerRuntime:GarbageCollector:InactiveObject_Loaded",
						id: { value: `/${idA}`, tag: "CodeArtifact" },
					},
				],
				"Expected dataObjectA to be inactive",
			);

			// Reference A again in container1. Should be revived on container3
			defaultDataObject1._root.set("A", dataObjectA_1.handle);
			await provider.ensureSynchronized();

			// Since A was directly revived, its unreferenced state was cleared immediately so we shouldn't see InactiveObject logs for it
			const handleA_3 = defaultDataObject3._root.get<IFluidHandle<ITestDataObject>>("A");
			const dataObjectA_3 = await handleA_3!.get();
			mockLogger3.assertMatchNone(
				[
					{
						eventName:
							"fluid:telemetry:ContainerRuntime:GarbageCollector:InactiveObject_Loaded",
					},
				],
				"Expected no InactiveObject_Loaded events due to revival",
			);

			// Since B wasn't directly revived, it wrongly still thinks it's Inactive. Next GC will clear it up.
			const handleB_3 = dataObjectA_3?._root.get<IFluidHandle<ITestDataObject>>("B");
			await handleB_3!.get();
			mockLogger3.assertMatch(
				[
					{
						eventName:
							"fluid:telemetry:ContainerRuntime:GarbageCollector:InactiveObject_Loaded",
						id: { value: `/${idB}`, tag: "CodeArtifact" },
					},
				],
				"Expected dataObjectB to be considered inactive still",
			);
		});

		const newDDSFn = async (
			dataObject: ITestDataObject,
		): Promise<[ISharedDirectory, IFluidHandle]> => {
			const dds = SharedDirectory.create(dataObject._runtime, "dds");
			return [dds, dds.handle];
		};
		const newDataStoreFn = async (
			dataObject: ITestDataObject,
		): Promise<[ISharedDirectory, IFluidHandle]> => {
			const dataObject2 = await createNewDataObject(dataObject._context.containerRuntime);
			return [dataObject2._root, dataObject2.handle];
		};
		[[newDDSFn, "DDS"] as const, [newDataStoreFn, "DataStore"] as const].forEach(
			([newDirectoryFn, type]) => {
				it(`Reviving an InactiveObject via [${type}] Attach Op clears Inactive state immediately in interactive client (but not for its subtree)`, async () => {
					const container1 = mainContainer;
					const { summarizer: summarizer1 } = await createSummarizer(
						provider,
						container1,
						testContainerConfig,
					);
					const defaultDataObject1 = (await container1.getEntryPoint()) as ITestDataObject;
					await waitForContainerConnection(container1);

					const dataObjectA_1 = await createNewDataObject();
					const dataObjectB_1 = await createNewDataObject();
					const idA = dataObjectA_1._context.id;
					const idB = dataObjectB_1._context.id;

					// Reference A from the container entrypoint, and B from A
					defaultDataObject1._root.set("A", dataObjectA_1.handle);
					dataObjectA_1._root.set("B", dataObjectB_1.handle);

					// Then unreference the A-B chain (but leave it intact), and Summarize to start unreferenced tracking
					defaultDataObject1._root.delete("A");
					await provider.ensureSynchronized();
					const { summaryVersion: summaryVersion1 } = await summarizeNow(summarizer1);

					// A and B are unreferenced in container2/container3. Timers will be set
					// We need two containers because each event type is only logged once per container
					const mockLogger2 = new MockLogger();
					const container2 = await loadContainer(
						testContainerConfig,
						summaryVersion1,
						mockLogger2,
					);
					const defaultDataObject2 = (await container2.getEntryPoint()) as ITestDataObject;
					const mockLogger3 = new MockLogger();
					const container3 = await loadContainer(
						testContainerConfig,
						summaryVersion1,
						mockLogger3,
					);
					const defaultDataObject3 = (await container3.getEntryPoint()) as ITestDataObject;

					// Wait the Inactive Timeout. Timers will fire
					await waitForInactiveTimeout();

					// Load A in container2 and ensure InactiveObject_Loaded is logged
					const handleA_2 = manufactureHandle<ITestDataObject>(
						defaultDataObject2._context.IFluidHandleContext, // yields the ContaineRuntime's handleContext
						idA,
					);
					await handleA_2.get();
					mockLogger2.assertMatch(
						[
							{
								eventName:
									"fluid:telemetry:ContainerRuntime:GarbageCollector:InactiveObject_Loaded",
								id: { value: `/${idA}`, tag: "CodeArtifact" },
							},
						],
						"Expected dataObjectA to be inactive",
					);

					// Reference A again in container3 via DataStore attach op. Should be properly revived in container3 itself
					const manufacturedHandleA_3 = manufactureHandle<ITestDataObject>(
						defaultDataObject3._context.IFluidHandleContext, // yields the ContaineRuntime's handleContext
						idA,
					);
					const [newDirectory_3, handleToAttach_3] = await newDirectoryFn(defaultDataObject3);
					newDirectory_3.set("A", manufacturedHandleA_3);
					defaultDataObject3._root.set("NewDirectory", handleToAttach_3);
					await provider.ensureSynchronized();

					// Since A was directly revived, its unreferenced state was cleared immediately so we shouldn't see InactiveObject logs for it
					const handleA_3 = newDirectory_3.get<IFluidHandle<ITestDataObject>>("A");
					const dataObjectA_3 = await handleA_3!.get();
					mockLogger3.assertMatchNone(
						[
							{
								eventName:
									"fluid:telemetry:ContainerRuntime:GarbageCollector:InactiveObject_Loaded",
							},
						],
						"Expected no InactiveObject_Loaded events due to revival",
					);

					// Since B wasn't directly revived, it wrongly still thinks it's Inactive. Next GC will clear it up.
					const handleB_3 = dataObjectA_3?._root.get<IFluidHandle<ITestDataObject>>("B");
					await handleB_3!.get();
					mockLogger3.assertMatch(
						[
							{
								eventName:
									"fluid:telemetry:ContainerRuntime:GarbageCollector:InactiveObject_Loaded",
								id: { value: `/${idB}`, tag: "CodeArtifact" },
							},
						],
						"Expected dataObjectB to be inactive still",
					);
				});
			},
		);
	});
});
