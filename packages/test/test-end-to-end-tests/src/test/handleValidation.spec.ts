/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { describeCompat } from "@fluid-private/test-version-utils";
import type { ISharedCell } from "@fluidframework/cell/internal";
import { IContainerExperimental } from "@fluidframework/container-loader/internal";
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
	createAndAttachContainer,
	ITestFluidObject,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import type { ISharedMatrix } from "@fluidframework/matrix/internal";
import type { IConsensusRegisterCollection } from "@fluidframework/register-collection/internal";
import {
	ConsensusResult,
	type ConsensusCallback,
	type ConsensusQueue,
	type IConsensusOrderedCollection,
} from "@fluidframework/ordered-collection/internal";
import {
	ISharedTree,
	SharedTree,
	SchemaFactory,
	TreeConfiguration,
} from "@fluidframework/tree/internal";

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

function treeSetup (dds) {
	const builder = new SchemaFactory("test");
				class Bar extends builder.object("bar", {
					h: builder.optional(builder.handle),
				}) {}

				const config = new TreeConfiguration(Bar, () => ({
					h: undefined,
				}));

				const treeView = dds.schematize(config);
				// eslint-disable-next-line @typescript-eslint/no-unsafe-return
				return treeView;
}

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
		[treeId, SharedTree.getFactory()],
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
			enableRuntimeIdCompressor: "on",
		},
		loaderProps: {
			configProvider: configProvider({
				"Fluid.Container.enableOfflineLoad": true,
			}),
		},
	};

	async function setup() {
		const provider = getTestObjectProvider();
		const loader = provider.makeTestLoader(testContainerConfig);
		const container1 = await createAndAttachContainer(
			provider.defaultCodeDetails,
			loader,
			provider.driver.createCreateNewRequest(provider.documentId),
		);
		provider.updateDocumentId(container1.resolvedUrl);
		const url = await container1.getAbsoluteUrl("");
		const dataStore1 = (await container1.getEntryPoint()) as ITestFluidObject;
		const map1 = await dataStore1.getSharedObject<ISharedMap>(mapId);
		const cell1 = await dataStore1.getSharedObject<ISharedCell>(cellId);
		const directory1 = await dataStore1.getSharedObject<SharedDirectory>(directoryId);
		const tree1 = await dataStore1.getSharedObject<ISharedTree>(treeId);
		const matrix1 = await dataStore1.getSharedObject<ISharedMatrix>(matrixId);
		// legacyTree1 = await dataStore1.getSharedObject<LegacySharedTree>(legacyTreeId);
		const register1 =
			await dataStore1.getSharedObject<IConsensusRegisterCollection>(registerId);
		const queue1 = await dataStore1.getSharedObject<IConsensusOrderedCollection>(queueId);
		// migrationShim1 = await dataStore1.getSharedObject<MigrationShim>(migrationShimId);
		const string1 = await dataStore1.getSharedObject<SharedString>(stringId);
		string1.insertText(0, "hello");

		const waitForSummary = async () => {
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
		return {
			loader,
			provider,
			container1,
			map1,
			cell1,
			directory1,
			matrix1,
			register1,
			queue1,
			string1,
		};
	}

	it.skip("ensure single attach op sent in map", async function () {
		let idB;
		const { container1, provider } = await setup();
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
		const { container1, provider } = await setup();
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
		{
			type: treeId,
			fn: async (defaultDataStore, handle) => {
				const treeRoot = await defaultDataStore.getSharedObject(treeId);

				const treeView = treeSetup(treeRoot);
				treeView.root.h = handle;
			},
		},
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
			const { container1, provider } = await setup();
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

			let handleB;
			switch (storeHandle.type) {
				case mapId:
					handleB = dds2.get("B") as IFluidHandle<ITestFluidObject>;
					break;
				case cellId:
					handleB = dds2.get() as IFluidHandle<ITestFluidObject>;
					break;
				case directoryId:
					handleB = dds2.get("B") as IFluidHandle<ITestFluidObject>;
					break;
				case stringId:
					handleB = dds2.getPropertiesAtPosition(0)?.B;
					break;
				case matrixId:
					handleB = dds2.getCell(0, 0);
					break;
				case treeId:
					// eslint-disable-next-line no-case-declarations
					const treeView = treeSetup(dds2);
					handleB = treeView.root.h;
					break;
				case registerId:
					handleB = dds2.read("B");
					break;
				case queueId:
					// eslint-disable-next-line no-case-declarations
					const callback: ConsensusCallback<IFluidHandle> = async (value) => {
						handleB = value;
						return ConsensusResult.Release;
					};
					await (dds2 as ConsensusQueue).acquire(callback);
					break;
				default:
					assert(false, "unknown dds type");
			}

			const dataObjectB2 = await handleB.get();
			assert(dataObjectB2.context.id === idB);
		});
	}
});
