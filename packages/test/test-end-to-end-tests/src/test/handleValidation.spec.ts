/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { describeCompat } from "@fluid-private/test-version-utils";
import type { ISharedCell } from "@fluidframework/cell/internal";
import type { IHostLoader } from "@fluidframework/container-definitions/internal";
import { IContainerExperimental } from "@fluidframework/container-loader/internal";
import {
	CompressionAlgorithms,
	DefaultSummaryConfiguration,
} from "@fluidframework/container-runtime/internal";
import type {
	ConfigTypes,
	IConfigProviderBase,
	IFluidHandle,
} from "@fluidframework/core-interfaces";
import type { ISharedMap, ISharedDirectory, SharedDirectory } from "@fluidframework/map/internal";
import type { SharedString } from "@fluidframework/sequence/internal";
import {
	ChannelFactoryRegistry,
	ITestContainerConfig,
	DataObjectFactoryType,
	ITestObjectProvider,
	createAndAttachContainer,
	ITestFluidObject,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import type { ISharedMatrix } from "@fluidframework/matrix/internal";
import type { IConsensusRegisterCollection } from "@fluidframework/register-collection/internal";
import type { IConsensusOrderedCollection } from "@fluidframework/ordered-collection/internal";

const mapId = "map";
const stringId = "sharedString";
const cellId = "cell";
const counterId = "counter";
const directoryId = "directory";
const treeId = "tree";
const matrixId = "matrix";
const legacyTreeId = "legacyTree";
const registerId = "registerCollection";
const queueId = "consensusQueue";
const migrationShimId = "migrationShim";

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

describeCompat("handle validation", "NoCompat", (getTestObjectProvider, apis) => {
	const {
		SharedMap,
		SharedDirectory,
		SharedCounter,
		SharedString,
		SharedCell,
		SharedMatrix,
		ConsensusRegisterCollection,
		ConsensusQueue,
	} = apis.dds;

	const registry: ChannelFactoryRegistry = [
		[mapId, SharedMap.getFactory()],
		[stringId, SharedString.getFactory()],
		[cellId, SharedCell.getFactory()],
		[counterId, SharedCounter.getFactory()],
		[directoryId, SharedDirectory.getFactory()],
		// [treeId, SharedTree.getFactory()],
		[matrixId, SharedMatrix.getFactory()],
		// [legacyTreeId, LegacySharedTree.getFactory()],
		[registerId, ConsensusRegisterCollection.getFactory()],
		[queueId, ConsensusQueue.getFactory()],
		// [
		// 	migrationShimId,
		// 	new MigrationShimFactory(
		// 		LegacySharedTree.getFactory(),
		// 		SharedTree.getFactory(),
		// 		(legacyTree, newTree) => {
		// 			throw new Error("unreachable");
		// 		},
		// 	),
		// ],
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
	let directory1: ISharedDirectory;
	// let tree1: ISharedTree;
	let matrix1: ISharedMatrix;
	// let legacyTree1: LegacySharedTree;
	let register1: IConsensusRegisterCollection;
	let queue1: IConsensusOrderedCollection;
	// let migrationShim1: MigrationShim;

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
		directory1 = await dataStore1.getSharedObject<SharedDirectory>(directoryId);
		// tree1 = await dataStore1.getSharedObject<ISharedTree>(treeId);
		matrix1 = await dataStore1.getSharedObject<ISharedMatrix>(matrixId);
		// legacyTree1 = await dataStore1.getSharedObject<LegacySharedTree>(legacyTreeId);
		register1 = await dataStore1.getSharedObject<IConsensusRegisterCollection>(registerId);
		queue1 = await dataStore1.getSharedObject<IConsensusOrderedCollection>(queueId);
		// migrationShim1 = await dataStore1.getSharedObject<MigrationShim>(migrationShimId);
		string1 = await dataStore1.getSharedObject<SharedString>(stringId);
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

	const handleFns = [
		{
			type: mapId,
			fn: async (defaultDataStore, handle) => {
				const mapRoot = await defaultDataStore.getSharedObject(mapId);
				mapRoot.set("B", handle);
			},
		},
		{
			type: cellId,
			fn: async (defaultDataStore, handle) => {
				const cellRoot = await defaultDataStore.getSharedObject(cellId);
				cellRoot.set(handle);
			},
		},
		{
			type: directoryId,
			fn: async (defaultDataStore, handle) => {
				const dirRoot = await defaultDataStore.getSharedObject(directoryId);
				dirRoot.set("B", handle);
			},
		},
		{
			type: stringId,
			fn: async (defaultDataStore, handle) => {
				const stringRoot = await defaultDataStore.getSharedObject(stringId);
				stringRoot.annotateRange(0, 1, { B: handle });
			},
		},
		{
			type: matrixId,
			fn: async (defaultDataStore, handle) => {
				const matrixRoot = await defaultDataStore.getSharedObject(matrixId);
				matrixRoot.insertRows(0, 1);
				matrixRoot.insertCols(0, 1);
				matrixRoot.setCell(0, 0, handle);
			},
		},
		// {
		// 	type: treeId,
		// 	fn: async (defaultDataStore, handle) => {
		// 		const treeRoot = await defaultDataStore.getSharedObject(treeId);

		// 		const builder = new SchemaFactory("test");
		// 		class Bar extends builder.object("bar", {
		// 			h: builder.optional(builder.handle),
		// 		}) {}

		// 		const config = new TreeConfiguration(Bar, () => ({
		// 			h: undefined,
		// 		}));

		// 		const treeView = treeRoot.schematize(config);
		// 		treeView.root.h = handle;
		// 	},
		// },
		// {
		// 	type: legacyTreeId,
		// 	fn: async (defaultDataStore, handle) => {
		// 		const treeRoot = await defaultDataStore.getSharedObject(legacyTreeId);
		// 		const legacyNodeId: TraitLabel = "inventory" as TraitLabel;

		// 		const handleNode: BuildNode = {
		// 			definition: legacyNodeId,
		// 			traits: {
		// 				handle,
		// 			},
		// 		};
		// 		treeRoot.applyEdit(
		// 			Change.insertTree(
		// 				handleNode,
		// 				StablePlace.atStartOf({
		// 					parent: treeRoot.currentView.root,
		// 					label: legacyNodeId,
		// 				}),
		// 			),
		// 		);

		// 		const rootNode = treeRoot.currentView.getViewNode(treeRoot.currentView.root);
		// 		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		// 		const nodeId = rootNode.traits.get(legacyNodeId)![0];
		// 		const change: Change = Change.setPayload(nodeId, handle);
		// 		treeRoot.applyEdit(change);
		// 	},
		// },
		{
			type: registerId,
			fn: async (defaultDataStore, handle) => {
				const registerRoot = await defaultDataStore.getSharedObject(registerId);
				registerRoot.write("B", handle);
			},
		},
		{
			type: queueId,
			fn: async (defaultDataStore, handle) => {
				const queueRoot = await defaultDataStore.getSharedObject(queueId);
				queueRoot.add(handle);
			},
		},
		// {
		// 	type: migrationShimId,
		// 	fn: async (defaultDataStore, handle) => {
		// 		const migrationShimRoot = await defaultDataStore.getSharedObject(migrationShimId);
		// 		const tree = migrationShimRoot.currentTree as LegacySharedTree;
		// 		const legacyNodeId: TraitLabel = "inventory" as TraitLabel;

		// 		const handleNode: BuildNode = {
		// 			definition: legacyNodeId,
		// 			traits: {
		// 				handle,
		// 			},
		// 		};
		// 		tree.applyEdit(
		// 			Change.insertTree(
		// 				handleNode,
		// 				StablePlace.atStartOf({
		// 					parent: tree.currentView.root,
		// 					label: legacyNodeId,
		// 				}),
		// 			),
		// 		);

		// 		const rootNode = tree.currentView.getViewNode(tree.currentView.root);
		// 		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		// 		const nodeId = rootNode.traits.get(legacyNodeId)![0];
		// 		const change = Change.setPayload(nodeId, handle);
		// 		tree.applyEdit(change);
		// 	},
		// },
	];

	for (const storeHandle of handleFns) {
		it(`store handle in dds: ${storeHandle.type}`, async () => {
			const defaultDataStore = (await container1.getEntryPoint()) as ITestFluidObject;
			const runtime = defaultDataStore.context.containerRuntime;

			const dataStoreB = await runtime.createDataStore(["default"]);
			const dataObjectB = (await dataStoreB.entryPoint.get()) as ITestFluidObject;
			const idB = dataObjectB.context.id;

			await storeHandle.fn(defaultDataStore, dataObjectB.handle);

			await provider.ensureSynchronized();
			const container2: IContainerExperimental =
				await provider.loadTestContainer(testContainerConfig);
			await waitForContainerConnection(container2);
			const default2 = (await container2.getEntryPoint()) as ITestFluidObject;
			const dds2 = await default2.getSharedObject(storeHandle.type);

			const handleB = dds2.get() as IFluidHandle<ITestFluidObject>;
			const dataObjectB2 = await handleB.get();
			assert(dataObjectB2.context.id === idB);
		});
	}
});
