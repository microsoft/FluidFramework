/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { SharedTree } from "@fluid-experimental/tree";
import { describeCompat } from "@fluid-private/test-version-utils";
import type { ISharedCell } from "@fluidframework/cell/internal";
import type { IHostLoader } from "@fluidframework/container-definitions/internal";
import type { IContainerExperimental } from "@fluidframework/container-loader/internal";
import {
	CompressionAlgorithms,
	DefaultSummaryConfiguration,
} from "@fluidframework/container-runtime/internal";
import type {
	ConfigTypes,
	IConfigProviderBase,
	IFluidHandle,
} from "@fluidframework/core-interfaces";
import type { SharedCounter } from "@fluidframework/counter/internal";
import type { ISharedMap, ISharedDirectory, SharedDirectory } from "@fluidframework/map/internal";
import type {
	IIntervalCollection,
	SequenceInterval,
	SharedString,
} from "@fluidframework/sequence/internal";
import {
	type ChannelFactoryRegistry,
	type ITestContainerConfig,
	DataObjectFactoryType,
	type ITestObjectProvider,
	createAndAttachContainer,
	type ITestFluidObject,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

const mapId = "map";
const stringId = "sharedStringKey";
const cellId = "cellKey";
const counterId = "counterKey";
const directoryId = "directoryKey";
const collectionId = "collectionKey";
const treeId = "treeKey";

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

describeCompat("stashed ops", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedMap, SharedDirectory, SharedCounter, SharedString, SharedCell } = apis.dds;

	const registry: ChannelFactoryRegistry = [
		[mapId, SharedMap.getFactory()],
		[stringId, SharedString.getFactory()],
		[cellId, SharedCell.getFactory()],
		[counterId, SharedCounter.getFactory()],
		[directoryId, SharedDirectory.getFactory()],
		[treeId, SharedTree.getFactory()],
	];

	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
		runtimeOptions: {
			chunkSizeInBytes: Number.POSITIVE_INFINITY, // disable
			compressionOptions: {
				minimumBatchSizeInBytes: Number.POSITIVE_INFINITY,
				compressionAlgorithm: CompressionAlgorithms.lz4,
			},
			summaryOptions: {
				summaryConfigOverrides: {
					...DefaultSummaryConfiguration,
					...{
						maxTime: 5000 * 12,
						maxAckWaitTime: 120000,
						maxOps: 1,
						initialSummarizerDelayMs: 20,
					},
				},
			},
			enableRuntimeIdCompressor: "on",
		},
		loaderProps: {
			configProvider: configProvider({
				"Fluid.Container.enableOfflineLoad": true,
			}),
		},
	};

	let provider: ITestObjectProvider;
	let url;
	let loader: IHostLoader;
	let container1: IContainerExperimental;
	let map1: ISharedMap;
	let string1: SharedString;
	let cell1: ISharedCell;
	let counter1: SharedCounter;
	let directory1: ISharedDirectory;
	let collection1: IIntervalCollection<SequenceInterval>;
	let waitForSummary: () => Promise<void>;

	beforeEach("setup", async () => {
		provider = getTestObjectProvider();
		loader = provider.makeTestLoader(testContainerConfig);
		container1 = await createAndAttachContainer(
			provider.defaultCodeDetails,
			loader,
			provider.driver.createCreateNewRequest(provider.documentId),
		);
		provider.updateDocumentId(container1.resolvedUrl);
		url = await container1.getAbsoluteUrl("");
		const dataStore1 = (await container1.getEntryPoint()) as ITestFluidObject;
		map1 = await dataStore1.getSharedObject<ISharedMap>(mapId);
		cell1 = await dataStore1.getSharedObject<ISharedCell>(cellId);
		counter1 = await dataStore1.getSharedObject<SharedCounter>(counterId);
		directory1 = await dataStore1.getSharedObject<SharedDirectory>(directoryId);
		string1 = await dataStore1.getSharedObject<SharedString>(stringId);
		collection1 = string1.getIntervalCollection(collectionId);
		string1.insertText(0, "hello");

		waitForSummary = async () => {
			await new Promise<void>((resolve, reject) => {
				let summarized = false;
				container1.on("op", (op) => {
					if (op.type === "summarize") {
						summarized = true;
					} else if (summarized && op.type === "summaryAck") {
						resolve();
					} else if (op.type === "summaryNack") {
						reject(new Error("summaryNack"));
					}
				});
			});
		};
	});

	it.skip("ensure single attach op sent in map", async function () {
		let idB;
		const cb = async (container, d?) => {
			const defaultDataStore = (await container.getEntryPoint()) as ITestFluidObject;
			const runtime = defaultDataStore.context.containerRuntime;

			const dataStoreB = await runtime.createDataStore(["default"]);
			const dataObjectB = (await dataStoreB.entryPoint.get()) as ITestFluidObject;
			idB = dataObjectB.context.id;

			defaultDataStore.root.set("B", dataObjectB.handle);
		};

		await cb(container1);
		await provider.ensureSynchronized();

		const container3: IContainerExperimental =
			await provider.loadTestContainer(testContainerConfig);
		await waitForContainerConnection(container3);
		const default3 = (await container3.getEntryPoint()) as ITestFluidObject;

		const handleB = default3.root.get("B");
		const dataObjectB3 = await handleB.get();
		assert(dataObjectB3.context.id === idB);
	});

	it.skip("ensure single attach op sent in all other ddss", async function () {
		let idB;
		const cb = async (container, d?) => {
			const defaultDataStore = (await container.getEntryPoint()) as ITestFluidObject;
			const runtime = defaultDataStore.context.containerRuntime;

			const cellRoot = await defaultDataStore.getSharedObject<ISharedCell>(cellId);
			const dirRoot = await defaultDataStore.getSharedObject<ISharedDirectory>(directoryId);
			const stringRoot = await defaultDataStore.getSharedObject<SharedString>(stringId);

			const dataStoreB = await runtime.createDataStore(["default"]);
			const dataObjectB = (await dataStoreB.entryPoint.get()) as ITestFluidObject;
			idB = dataObjectB.context.id;

			cellRoot.set(dataObjectB.handle);
			dirRoot.set("B", dataObjectB.handle);
			stringRoot.annotateRange(0, 1, { B: dataObjectB.handle });
		};

		await cb(container1);
		await provider.ensureSynchronized();

		const container3: IContainerExperimental =
			await provider.loadTestContainer(testContainerConfig);
		await waitForContainerConnection(container3);
		const default3 = (await container3.getEntryPoint()) as ITestFluidObject;
		const cell3 = await default3.getSharedObject<ISharedCell>(cellId);
		const dir3 = await default3.getSharedObject<ISharedDirectory>(directoryId);
		const string3 = await default3.getSharedObject<SharedString>(stringId);

		const cellHandleB = cell3.get() as IFluidHandle<ITestFluidObject>;
		const cellObjectB3 = await cellHandleB.get();
		assert(cellObjectB3.context.id === idB);

		const dirHandleB = dir3.get("B");
		const dirObjectB3 = await dirHandleB.get();
		assert(dirObjectB3.context.id === idB);

		const stringHandleB = string3.getPropertiesAtPosition(0)?.B;
		const stringObjectB3 = await stringHandleB.get();
		assert(stringObjectB3.context.id === idB);
	});
});
